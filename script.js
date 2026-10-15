/* =========================================================
   ROOM HUNT - APPLICATION CONTROLLER
   JavaScript only: this file controls behaviour and data.
   IMPORTANT: no HTML markup is created in this file.
   All interface elements already exist in index.html.
========================================================= */
(() => {
  'use strict';

  /* =========================================================
     STORAGE + APPLICATION CONSTANTS
  ========================================================== */
  const VIDEO_DB = 'roomhunt_video_store';
  const STORAGE = {
    session: 'roomhunt_session', listings: 'roomhunt_listings', favourites: 'roomhunt_favourites',
    notifications: 'roomhunt_notifications', messages: 'roomhunt_messages', subscription: 'roomhunt_subscription',
    theme: 'roomhunt_theme', notify: 'roomhunt_notify', searches: 'roomhunt_searches', profile: 'roomhunt_profile', permissions: 'roomhunt_permissions'
  };
  const DEMO_IMAGES = [
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1560185008-b033106af5c3?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=900&q=80'
  ];
  const FACILITY_NAMES = ['Wi-Fi','Attached Bathroom','Bed','Electricity','Parking','Lift','AC','Kitchen','Tap Water','Fan','Furniture','Terrace','Swimming Pool','Garden','Gym','Food / Meals'];
  const FACILITY_ICONS = ['📶','🚿','🛏','⚡','🚗','🛗','❄','🍳','🚰','🌀','🪑','🌇','🏊','🌳','🏋','🍽'];
   let state = {
  generatedOtp: '',
  role: 'user',

  // LIVE LOCATION
  currentLocation: '',
  currentLatitude: null,
  currentLongitude: null,
  locationAccuracy: null,

  homeType: 'All',

  filters: {
    type:'All',
    location:'',
    min:'',
    max:'',
    distance:5,
    availability:'available',
    facilities:[]
  },
    pendingDeleteId: null, pendingContactId: null, pendingMessageId: null, activeMessageRoomId: null, editingId: null, photos: [], video: null,
    videoLoading: false, videoUploadProgress: null, isPublishing: false, notificationsEnabled: read(STORAGE.notify, true)
  };

  const $ = id => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  /* =========================================================
     STORAGE HELPERS
  ========================================================== */
  function read(key, fallback) { try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; } }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.warn(`Room Hunt storage write failed for ${key}:`, error); if (key === STORAGE.listings || key === STORAGE.messages) toast('Device storage is full. Please remove unused media or data.'); return false; } }
  function uid(prefix='id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
  function today() { return new Date().toISOString().slice(0,10); }
  function escapeText(value = '') {
  return String(value).replace(/[&<>"']/g, function (char) {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[char];
  });
} 
  // Video files are stored as binary blobs in IndexedDB instead of oversized localStorage strings.
  function openVideoDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(new Error('IndexedDB is not available'));return;}const request=indexedDB.open(VIDEO_DB,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('videos'))db.createObjectStore('videos');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open video storage'));});}
  async function saveVideoBlob(key,blob){const db=await openVideoDB();return new Promise((resolve,reject)=>{const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put(blob,key);tx.oncomplete=()=>{db.close();resolve(true);};tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not save video'));};});}
  async function loadVideoBlob(key){const db=await openVideoDB();return new Promise((resolve,reject)=>{const tx=db.transaction('videos','readonly');const req=tx.objectStore('videos').get(key);req.onsuccess=()=>{db.close();resolve(req.result||null);};req.onerror=()=>{db.close();reject(req.error||new Error('Could not load video'));};});}

  /* =========================================================
     DEMO LISTINGS
  ========================================================== */
  function seedListings() {
  return [];
}
  function listings(){
  return read(STORAGE.listings, []);
}
  /*====================*/
        async function loadRoomsFromSupabase(){
  if(!window.supabaseClient) return;

  const { data, error } = await window.supabaseClient
    .from("Room Hunt")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    console.error("Supabase Room Load Error:", error);
    return;
  }

  const rooms = (data || []).map(row => ({
    id: row.id,
    title: row.title || 'Room',
    type: row["property-type"] || 'Room',

    price: Number(row.price) || 0,

    suffix:
      row.price_suffix ||
      (
        row["property-type"] === 'Hotel'
          ? '/ Day'
          : (
              row["property-type"] === 'Flat' ||
              row["property-type"] === 'House'
            )
              ? 'Only'
              : '/ month'
      ),

    postDate: row.post_date || '',

    location: row.Location || row.location || '',
    city: row.city || row.Location || row.location || '',
    latitude: Number.isFinite(Number(row.latitude ?? row.lat)) && (row.latitude ?? row.lat) !== null ? Number(row.latitude ?? row.lat) : null,
    longitude: Number.isFinite(Number(row.longitude ?? row.lng ?? row.lon)) && (row.longitude ?? row.lng ?? row.lon) !== null ? Number(row.longitude ?? row.lng ?? row.lon) : null,
    distance: 0,

    facilities: (() => {
    const value = row.facilities;

    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    return [];
})(),
    images: (() => {
  if (Array.isArray(row.image_urls)) {
    return row.image_urls.filter(Boolean);
  }

  if (typeof row.image_urls === 'string') {
    try {
      const parsed = JSON.parse(row.image_urls);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      console.error('image_urls JSON parse error:', error);
    }
  }

  return row.image_url ? [row.image_url] : [];
})(),

    video: row.video_url || '',
    videoKey: '',

    description: row.description || '',

    ownerName: row.owner_name || 'Owner',
    ownerPhone: row.owner_phone || '',
    ownerWhatsapp: row.owner_whatsapp || '',

    ownerId: row.owner_id || null,

    available: row.available !== false,

    availabilityWindow: row.availability_window || '1 week',
    availabilityDate: row.availability_date || '',

    verified: true,
    createdAt: row.created_at
  }));
   write(STORAGE.listings, rooms);
  
  renderHome();
  renderProfile();

  console.log("Room Hunt rooms loaded:", rooms);
}                                        
                               /*====================*/

  function saveListings(items){ write(STORAGE.listings, items); }
  function favourites(){ return read(STORAGE.favourites, []); }
  function saveFavourites(items){ write(STORAGE.favourites, items); }
  function notifications(){ return read(STORAGE.notifications, []); }
  function saveNotifications(items){ write(STORAGE.notifications, items); }

  /* =========================================================
     STARTUP
  ========================================================== */
  document.addEventListener('DOMContentLoaded', async () => {
    init();
    updateHeaderFavoriteCount();
    await loadRoomsFromSupabase();
  });

  function init(){
    seedListings(); bindEvents(); restoreTheme(); restoreSession(); setToday(); updateNotificationBadge(); restorePermissions(); bindNotificationGestures();
    bindMessageGestures();

$('messageInput')?.addEventListener(
  'keydown',
  event => {

    if(
      event.key === 'Enter' &&
      !event.shiftKey
    ){

      event.preventDefault();
      sendChatMessage();

    }

  }
);
    renderHome(); renderFacilities();
  }

  /* =========================================================
     SCREEN + PAGE NAVIGATION
  ========================================================== */
  function showScreen(id){ $$('.app-screen').forEach(x=>x.classList.add('hidden')); $(id)?.classList.remove('hidden'); }
  function showPage(page){
    const session=read(STORAGE.session,null); if(session?.role==='owner' && page==='favorites'){toast('Favorites are available for user accounts only.');page='profile';}
    $$('.page-view').forEach(x=>x.classList.add('hidden')); $(`page-${page}`)?.classList.remove('hidden');
    $$('.nav-item').forEach(x=>x.classList.remove('active')); $$(`.nav-item[data-page="${page}"]`).forEach(x=>x.classList.add('active'));
    closeSidebar();
    if(page==='home'||page==='explore') renderHome();
    $$('[data-page="favorites"]').forEach(x=>x.classList.toggle('hidden',session?.role==='owner')); $$('[data-action="open-post"]').forEach(x=>x.classList.toggle('hidden',false));
    if(page==='favorites') renderFavorites();
    if(page==='profile') renderProfile();
    if(page==='messages') renderMessages();
    if(page==='notifications') renderNotifications();
    if(page==='settings') renderSettings();
  }
  function restoreSession(){
    const session=read(STORAGE.session,null);
    if(session?.loggedIn){ updateUserUI(session); showScreen('mainApp'); showPage('home'); }
    else { showScreen('splashScreen'); window.setTimeout(()=>showScreen('onboardingScreen'),1000); }
  }
  function updateUserUI(session){
    $('headerName').textContent=session.name||'User'; $('profileName').textContent=session.name||'User';
    $('profileRole').textContent=session.role==='owner'?'Owner':'User'; $('profilePhone').textContent=session.phone?`+91 ${session.phone}`:'+91';
                                               /*===============================*/
        const avatar=session.avatar||'';
const avatarNodes=[$('headerAvatar'),$('profileAvatar')];

const isAvatarImage =
  avatar.startsWith('data:image/') ||
  avatar.startsWith('https://') ||
  avatar.startsWith('http://');

avatarNodes.forEach(node=>{
  if(!node)return;

  const img=node.querySelector('.avatar-photo');
  const fallback=node.querySelector('.avatar-fallback');

  if(img){
    img.src=isAvatarImage ? avatar : '';
    img.classList.toggle('hidden',!isAvatarImage);
  }

  if(fallback){
    fallback.textContent='👤';
    fallback.classList.toggle('hidden',isAvatarImage);
  }
});                                       
                              /*===============================*/
    const activeSub=read(STORAGE.subscription,null);const hasActiveSubscription=Boolean(activeSub&&activeSub.expiresAt>Date.now());const activeOwnerListing=listings().some(item=>item.ownerId===session.ownerUid&&item.available);const ring=(session.role==='owner'&&activeOwnerListing)||(session.role==='user'&&hasActiveSubscription);avatarNodes.forEach(node=>node?.classList.toggle('subscription-ring',ring));
    $('ownerListings')?.classList.toggle('hidden',session.role!=='owner');
  }

  /* =========================================================
     EVENT BINDING
  ========================================================== */
  function bindEvents(){
    if (!document.documentElement.dataset.roomHuntDrawerKeys) {
      document.documentElement.dataset.roomHuntDrawerKeys = '1';
      document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeSidebar(); const menu=$('detailVideoMenu'); if(menu){menu.hidden=true;menu.classList.add('hidden');$('detailVideoMenuButton')?.setAttribute('aria-expanded','false');} } });
      document.addEventListener('click', event => { const drawer=$('sidebar'); if(drawer?.classList.contains('open') && !event.target.closest('#sidebar,[data-action="toggle-sidebar"]')) closeSidebar(); });
    }

    document.addEventListener('click', handleClick); document.addEventListener('click', handleGalleryImageClick);
    $('detailVideoThumb')?.addEventListener('click', showDetailVideoInGallery);
    $('detailVideoMenuButton')?.addEventListener('click', toggleDetailVideoMenu);
    $('detailVideoSpeed')?.addEventListener('change', event => {
      const video = $('detailVideo');
      const speed = Number(event.target.value);
      if (video && Number.isFinite(speed) && speed > 0) video.playbackRate = speed;
    });
    $('detailVideoMenu')?.addEventListener('click', handleDetailVideoMenuAction);
    $('detailVideoDownload')?.addEventListener('click', event => {
      const link = event.currentTarget;
      const videoUrl = String($('detailVideo')?.currentSrc || $('detailVideo')?.src || '').trim();
      if (!videoUrl || videoUrl === window.location.href) {
        event.preventDefault();
        toast('No room video is available to download.');
        return;
      }
      // Supabase Storage supports the download query parameter for public objects.
      try {
        const url = new URL(videoUrl, window.location.href);
        url.searchParams.set('download', link.download || 'room-video.mp4');
        link.href = url.toString();
      } catch (error) {
        console.error('Could not prepare video download:', error);
      }
    });
    document.addEventListener('click', event => {
      const menu = $('detailVideoMenu');
      if (!menu || menu.hidden || event.target.closest('#detailVideoMenu, #detailVideoMenuButton')) return;
      menu.hidden = true;
      menu.classList.add('hidden');
      $('detailVideoMenuButton')?.setAttribute('aria-expanded', 'false');
    });
    $('loginPhone')?.addEventListener('input', sanitizePhone); $('ownerPhone')?.addEventListener('input', sanitizePhone); $('ownerWhatsapp')?.addEventListener('input', sanitizePhone);
    $('propertyType')?.addEventListener('change', updatePriceSuffix); $('propertyAvailable')?.addEventListener('change', updateAvailabilityUI); $('availabilityWindow')?.addEventListener('change', updateAvailabilityUI);
    $('propertyForm')?.addEventListener('submit', submitProperty); $('feedbackForm')?.addEventListener('submit', submitFeedback); $('visitForm')?.addEventListener('submit', submitVisitRequest); $('messagePhotoInput')?.addEventListener('change', handleMessagePhoto); $('exploreSearchForm')?.addEventListener('submit', event=>{event.preventDefault();state.filters.location=$('exploreSearch').value.trim();$('homeSearch').value=state.filters.location;renderHome();}); $('photoFileInput')?.addEventListener('change', handlePhotoFiles); $('cameraInput')?.addEventListener('change', handlePhotoFiles); $('videoFileInput')?.addEventListener('change', handleVideoFile); $('profilePhotoInput').addEventListener('change', handleProfilePhoto); $$('[data-permission]').forEach(select=>select.addEventListener('change',()=>{}));
    $$('#otpBoxes input').forEach((input,index)=>{
      input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,1); if(input.value && index<5) $$('#otpBoxes input')[index+1].focus();});
      input.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!input.value&&index>0) $$('#otpBoxes input')[index-1].focus();});
    });
  }

  /* =========================================================
     CLICK ROUTER
  ========================================================== */
  function handleClick(event){
    if(
  $('messageContextMenu') &&
  !event.target.closest('#messageContextMenu')
){

  closeMessageContextMenu();

}
    const action=event.target.closest('[data-action]'); 
    const messageRoomOpen =
  event.target.closest('[data-message-room-open]');

const messageRoomRemove =
  event.target.closest('[data-message-room-remove]');

const chatAction =
  event.target.closest('[data-chat-action]');
    const page=event.target.closest('[data-page]'); const role=event.target.closest('[data-role]');
    const location=event.target.closest('[data-location]'); const homeType=event.target.closest('[data-home-type]'); const filterType=event.target.closest('[data-filter-type]');
    const cardAction=event.target.closest('[data-card-action]'); const detailAction=event.target.closest('[data-detail-action]'); const plan=event.target.closest('[data-plan-months]'); const messageAction=event.target.closest('[data-message-action]'); const roomCard=event.target.closest('.listing-slot,.owner-listing-slot,.my-listing-row');
    if(location){ $('homeSearch').value=location.dataset.location; state.filters.location=location.dataset.location; return renderHome(); }
    if(homeType){ state.homeType=homeType.dataset.homeType; $$('.type-chip').forEach(x=>x.classList.toggle('active',x.dataset.homeType===state.homeType)); return renderHome(); }
    if(filterType){ state.homeType=filterType.dataset.filterType; showPage('home'); $$('.type-chip').forEach(x=>x.classList.toggle('active',x.dataset.homeType===state.homeType)); return renderHome(); }
    if(role){ state.role=role.dataset.role; showScreen('loginScreen'); return; }
    if(messageRoomRemove){

  event.preventDefault();
  event.stopPropagation();

  const card =
    messageRoomRemove.closest(
      '[data-message-room-card]'
    );

  return removeConversationRoom(
    card?.dataset.roomId
  );
}


if(messageRoomOpen){

  const card =
    messageRoomOpen.closest(
      '[data-message-room-card]'
    );

  return openRoomChat(
    card?.dataset.roomId
  );
}


if(chatAction){

  return handleChatAction(
    chatAction.dataset.chatAction
  );
}
    if(page){ return showPage(page.dataset.page); }
    if(roomCard && !event.target.closest('button,a,input,select,textarea,[data-card-action]')){ if(roomCard.dataset.id) return openDetails(roomCard.dataset.id); }
    if(plan){ return chooseSubscription(Number(plan.dataset.planMonths)); }
    if(messageAction){ return handleMessageAction(messageAction.dataset.messageAction,messageAction); }
    if(event.target.closest('.preview-delete')){ return deletePhoto(Number(event.target.closest('.preview-delete').dataset.photoIndex)); }
    if(event.target.closest('[data-video-delete]')){ return deleteVideo(); }
    if(cardAction){ return handleCardAction(cardAction); }
    if(detailAction){ return handleDetailAction(detailAction.dataset.detailAction); }
    if(action) return handleAction(action.dataset.action, action);
  }

  function handleAction(action, actionElement){
    switch(action){
      case 'next-onboarding': showScreen('featuresScreen'); break;
      case 'open-role': showScreen('roleScreen'); break;
      case 'send-otp': sendOtp(); break;
      case 'verify-otp': verifyOtp(); break;
      case 'resend-otp': generateOtp(); break;
      case 'open-post': openPost(); break;
      case 'cancel-owner-switch': closeModal('ownerSwitchModal'); break;
      case 'continue-owner-switch': continueOwnerSwitch(); break;
      case 'toggle-detail-more': toggleDetailMore(actionElement); break;
      case 'toggle-sidebar': { const drawer=$('sidebar'); const opening=!drawer?.classList.contains('open'); drawer?.classList.toggle('open', opening); document.body.classList.toggle('sidebar-open', opening); $$('[data-action="toggle-sidebar"]').forEach(button=>button.setAttribute('aria-expanded',String(opening))); break; }
      case 'choose-location': useCurrentLocation(); break;
      case 'use-current-location': useCurrentLocation(); break;
      case 'search-home': performSearch(); break;
      case 'sort-listings': cycleSort(); break;
      case 'open-filter': openFilter(); break;
      case 'reset-filter': resetFilter(); break;
      case 'apply-filter': applyFilter(); break;
      case 'see-all': state.homeType='All'; showPage('explore'); break;
      case 'edit-profile': openProfileEdit(); break;
      case 'save-profile': saveProfile(); break;
      case 'toggle-theme': toggleTheme(); break;
      case 'toggle-notifications': toggleNotifications(); break;
      case 'open-subscription': openSubscription(); break;
      case 'open-about': $('aboutModal').classList.remove('hidden'); break;
      case 'open-security': $('securityModal').classList.remove('hidden'); break;
      case 'open-help': $('helpModal').classList.remove('hidden'); setFeedbackDefaults(); break;
      case 'logout': $('logoutModal').classList.remove('hidden'); break;
      case 'cancel-logout': closeModal('logoutModal'); break;
      case 'confirm-logout': logout(); break;
      case 'clear-notifications': clearNotifications(); break;
      case 'remove-notification': removeNotification(actionElement?.closest('.notification-slot')?.dataset.id); break;
      case 'remove-profile-photo': removeProfilePhoto(); break;
      case 'choose-profile-photo': $('profilePhotoInput').click(); break;
      case 'save-permissions': savePermissions(); break;
      case 'search-explore': state.filters.location=$('exploreSearch').value.trim(); renderHome(); break;
      case 'close-modal': closeAllModals(); break;
      case 'finish-publish': finishPublish(); break;
      case 'confirm-delete': confirmDelete(); break;
      case 'demo-payment-success': demoPaymentSuccess(); break;
      case 'open-camera': $('cameraInput').click(); break;
      case 'open-photo-file': $('photoFileInput').click(); break;
      case 'open-video-file': $('videoFileInput').click(); break;
      case 'property-live-location': usePropertyLocation(); break;
      case 'send-message': sendChatMessage(); break;
      case 'close-room-chat': closeRoomChat(); break;}
    }

  /* =========================================================
     DEMO OTP
  ========================================================== */
  function generateOtp(){
    state.generatedOtp=String(Math.floor(100000+Math.random()*900000)); $('demoOtp').textContent=`Demo OTP: ${state.generatedOtp}`;
    $('otpError').textContent=''; $$('#otpBoxes input').forEach(x=>x.value=''); $$('#otpBoxes input')[0].focus(); toast('New 6-digit demo OTP generated');
  }
  function sendOtp(){
    const name=$('loginName').value.trim(); const phone=$('loginPhone').value.replace(/\D/g,'');
    if(name.length<2||phone.length!==10){$('loginError').textContent='Enter your name and a valid 10-digit mobile number.';return;}
    $('loginError').textContent=''; state.role=state.role||'user'; state.pendingLogin={name,phone,role:state.role}; generateOtp(); showScreen('otpScreen');
  }
                                                 /*============================*/
         async function verifyOtp(){
  const value=$$('#otpBoxes input').map(x=>x.value).join('');

  if(value!==state.generatedOtp){
    $('otpError').textContent='Incorrect demo OTP. Generate a new OTP and try again.';
    return;
  }

  const pending=state.pendingLogin||{};
  const phone=pending.phone;

  let ownerUid=null;

  /* =====================================================
     OWNER SUPABASE AUTH
  ====================================================== */

  if(state.role==='owner'){
    try{
      const client=window.supabaseClient;

      const {data:sessionData}=await client.auth.getSession();

      if(sessionData?.session?.user?.id){
        ownerUid=sessionData.session.user.id;
      }else{
        const {data,error}=await client.auth.signInAnonymously();

        if(error) throw error;

        ownerUid=data.user.id;
      }

    }catch(error){
      console.error('Owner Auth Error:',error);
      $('otpError').textContent='Owner login setup failed. Please try again.';
      return;
    }
  }

  /* =====================================================
     LOAD SAVED PROFILE BY PHONE NUMBER
  ====================================================== */

  let savedProfile=null;

  try{
    savedProfile=await loadProfileFromSupabase(phone);
  }catch(error){
    console.error('Profile Load Error:',error);
  }

  /* =====================================================
     CREATE SESSION
  ====================================================== */

  const session={
    ...pending,

    /* Saved profile ka name/DP use hoga */
    name:savedProfile?.name || pending.name || 'User',

    avatar:savedProfile?.avatar_url || '👤',

    loggedIn:true,
    loggedAt:Date.now(),

    ownerUid:ownerUid
  };

  write(STORAGE.session,session);

  /* =====================================================
     PROFILE SAVE / UPDATE
  ====================================================== */

  try{
    await saveProfileToSupabase(session);
  }catch(error){
    console.error('Profile Save Error:',error);
  }

  updateUserUI(session);

  showScreen('mainApp');
  showPage('home');

  toast(
    savedProfile
      ? 'Welcome back! Profile restored.'
      : 'Login successful'
  );
}
  /* =========================================================
     HOME SEARCH + FILTERS
  ========================================================== */
  function performSearch(){
    const query=$('homeSearch').value.trim(); state.filters.location=query; addSearchPreference(query); renderHome();
    if(query&&!hasMatchingListing(query)) addNotification(`We saved your search for ${query}. New nearby listings can be shown when available.`,'search');
  }
  function hasMatchingListing(query){return listings().some(x=>x.available&&x.location.toLowerCase().includes(query.toLowerCase()));}
  function cycleSort(){
    const modes=['recommended','price-low','price-high','distance']; const index=modes.indexOf(state.sort); state.sort=modes[(index+1)%modes.length]; renderHome();
  }
  function sorted(items){
    const copy=[...items]; if(state.sort==='price-low')copy.sort((a,b)=>a.price-b.price); if(state.sort==='price-high')copy.sort((a,b)=>b.price-a.price); if(state.sort==='distance')copy.sort((a,b)=>(a.distance||99)-(b.distance||99)); return copy;
  }
  function filteredListings(){
    let items=listings(); const session=read(STORAGE.session,null); if(session?.role==='owner') items=items.filter(x=>x.ownerId===session.ownerUid); const f=state.filters; const type=state.homeType||f.type||'All';
    if(type!=='All') items=items.filter(x=>x.type===type);
    if(type!=='Hotel') items=items.filter(x=>x.type!=='Hotel');
    if(type==='Hotel') items=items.filter(x=>x.type==='Hotel');
    if(f.location && !f.location.startsWith('Current location (')) items=items.filter(x=>x.location.toLowerCase().includes(f.location.toLowerCase())||x.city?.toLowerCase().includes(f.location.toLowerCase()));
    if(f.min) items=items.filter(x=>x.price>=Number(f.min)); if(f.max) items=items.filter(x=>x.price<=Number(f.max));
    items=items.filter(x=>(x.distance||5)<=Number(f.distance||5));
    if(f.availability==='available') items=items.filter(x=>x.available);
    if(f.facilities.length) items=items.filter(x=>f.facilities.every(name=>(x.facilities||[]).includes(name)));
    return sorted(items);
  }
  function renderFacilities() {
  const groups = [
    { name: 'propertyFacilities', selector: 'property' },
    { name: 'filterFacilities', selector: 'filter' }
  ];

  groups.forEach(({ name, selector }) => {
    $$(`input[data-facility-group="${selector}"]`).forEach((input, index) => {
      input.value = FACILITY_NAMES[index] || '';
      input.dataset.facilityGroup = selector;
    });
  });
}
  function renderHome(){
    const items=filteredListings(); renderListInto('roomCards',items); renderListInto('exploreCards',items); updateHomeText(items); updateNotificationBadge();
  }
  function renderListInto(containerId,items){
    const container=$(containerId); if(!container)return; const slots=$$('.listing-slot',container);
    slots.forEach((slot,index)=>{
  const item = items[index];

  if(!item){
    slot.hidden = true;
    slot.dataset.id = '';
    return;
  }

  slot.hidden = false;
  fillListingCard(slot,item);
});
  }
  function fillListingCard(card,item){
    card.dataset.id=item.id; const img=card.querySelector('[data-ref="image"]'); img.onerror=()=>{img.onerror=null;img.src=DEMO_IMAGES[0];}; img.src=item.images?.[0]||DEMO_IMAGES[0];
    card.querySelector('[data-ref="price"]').textContent=Number(item.price).toLocaleString('en-IN'); card.querySelector('[data-ref="suffix"]').textContent=item.suffix;
    card.querySelector('[data-ref="title"]').textContent=item.title; card.querySelector('[data-ref="location"]').textContent=item.location; card.querySelector('[data-ref="distance"]').textContent=`${item.distance||0} km away`;
    card.querySelector('[data-ref="status"]').textContent = String(item.type || 'Room').toUpperCase(); card.querySelector('[data-ref="availability"]').textContent=item.available?'● Available':'● Unavailable'; card.querySelector('[data-ref="availability"]').className=`listing-status ${item.available?'available':'unavailable'}`;
    const tags=card.querySelector('[data-ref="tags"]'); const tagSlots=$$('.tag',tags); tagSlots.forEach((x,i)=>{x.hidden=!(item.facilities||[])[i];if(!x.hidden)x.textContent=(item.facilities||[])[i];});
    const fav = card.querySelector('[data-card-action="favorite"]');
const session = read(STORAGE.session, null);

if(fav){
  const isFavourite = favourites().some(
    savedId => String(savedId) === String(item.id)
  );

  fav.hidden = session?.role === 'owner';
  fav.textContent = isFavourite ? '♥' : '♡';
  fav.classList.toggle('active', isFavourite);
}
    card.querySelector('[data-ref="unavailable"]').textContent=item.available?'':'Sorry, this property is currently unavailable.';
    card.classList.toggle('unavailable-card',!item.available);
  }
  function updateHomeText(items){
    $('listingSubtitle').textContent=state.filters.location?`${items.length} property result(s) near ${state.filters.location}.`:`${items.length} available property result(s) within ${state.filters.distance||5} km.`;
    const sortLabel={recommended:'Recommended', 'price-low':'Price: Low to High','price-high':'Price: High to Low',distance:'Distance'}[state.sort]||'Recommended'; $$('[data-action="sort-listings"]').forEach(x=>x.textContent=`Sort: ${sortLabel} ⌄`);
  }

  /* =========================================================
     FAVOURITES + CARD ACTIONS
  ========================================================== */
  function handleCardAction(button){
    const card=button.closest('.listing-slot,.owner-listing-slot'); const id=card?.dataset.id; const action=button.dataset.cardAction; if(!id)return;
    if(action==='favorite') toggleFavourite(id); if(action==='details') openDetails(id); if(action==='share') shareProperty(id); if(action==='edit') editProperty(id); if(action==='delete') openDelete(id);
  }
  function toggleFavourite(id){
  const fav = favourites().map(x => String(x));

  const normalizedId = String(id);
  const index = fav.indexOf(normalizedId);

  if(index >= 0){
    fav.splice(index, 1);
    saveFavourites(fav);
    toast('Unfavourites');
  }else{
    fav.push(normalizedId);
    saveFavourites(fav);
    toast('Saved to favourites');
  }

  updateProfileStats();
  updateHeaderFavoriteCount();
  renderHome();
  renderFavorites();
}
  function updateHeaderFavoriteCount(){
    const countNode = $('headerFavoriteCount');
    if(!countNode) return;
    const count = new Set(favourites().map(id => String(id))).size;
    countNode.textContent = String(count);
    countNode.hidden = count === 0;
    const button = countNode.closest('.header-fav-link');
    if(button) button.setAttribute('aria-label', `Open favourites, ${count} saved room${count === 1 ? '' : 's'}`);
  }

  function renderFavorites(){
  const fav = favourites().map(x => String(x));
  const items = listings().filter(item => fav.includes(String(item.id)));
  renderListInto('favoriteCards', items);
}

  /* =========================================================
     PROPERTY DETAILS
  ========================================================== */
  function openDetails(id){
    const item=listings().find(x=>String(x.id)===String(id)); if(!item)return; state.pendingContactId=id;
    $('detailTitle').textContent=item.title; $('detailPropertyTitle').textContent=item.title; $('detailMoreContent').classList.add('hidden'); const moreButton=$$('.view-more-details')[0]; if(moreButton){moreButton.textContent='View more…';moreButton.setAttribute('aria-expanded','false');} const sessionForDetails=read(STORAGE.session,null); const detailFav=$('[data-detail-action="favorite"]'); if(detailFav)detailFav.hidden=sessionForDetails?.role==='owner'; $('detailPrice').textContent=Number(item.price).toLocaleString('en-IN'); $('detailSuffix').textContent=item.suffix; $('detailLocation').textContent=item.location; $('detailDistance').textContent=`${item.distance||0} km`; $('detailDescription').textContent=item.description||''; $('detailOwnerName').textContent=item.ownerName||'Verified Owner'; $('detailOwnerStatus').textContent=item.verified?'✓ Mobile verified':'Owner profile';
    $('detailAvailability').textContent=item.available?'● Available':'● Unavailable'; $('detailAvailability').className=`listing-status ${item.available?'available':'unavailable'}`;
    const images = Array.isArray(item.images) && item.images.length ? item.images: DEMO_IMAGES;
    ['detailImage1',
    'detailImage2',
    'detailImage3',
    'detailImage4',
    'detailImage5',
    'detailImage6',
    'detailImage7',
    'detailImage8',
    'detailImage9',
    'detailImage10'
].forEach((id,index)=>{
  const node=$(id);
  node.src=images[index]||'';
  node.hidden=!images[index];
  node.dataset.galleryIndex=String(index);
  node.classList.toggle('gallery-active',index===0);
  node.alt=index===0?'Main property photo':'Select property photo '+(index+1);
});
      $('detailImage1').dataset.galleryImages=JSON.stringify(images);
    // Room video is another item in the existing gallery, not a separate block or popup.
    const video = $('detailVideo');
    const videoStage = $('detailVideoStage');
    const videoThumb = $('detailVideoThumb');
    const videoUrl = String(item.video || '').trim();
    if (video) {
      video.pause();
      video.playbackRate = 1;
      if ($('detailVideoSpeed')) $('detailVideoSpeed').value = '1';
      video.hidden = !videoUrl && !item.videoKey;
      video.classList.toggle('hidden', !videoUrl && !item.videoKey);
      if (videoUrl) {
        if (video.src !== videoUrl) video.src = videoUrl;
        video.load();
      } else {
        video.removeAttribute('src');
        video.load();
        if (item.videoKey) {
          loadVideoBlob(item.videoKey).then(blob => {
            if (blob && String(state.pendingContactId) === String(item.id)) {
              video.src = URL.createObjectURL(blob);
              video.hidden = false;
              video.classList.remove('hidden');
              video.load();
            }
          }).catch(error => {
            console.error('Saved room video could not be loaded:', error);
            toast('Saved video could not be loaded in this browser.');
          });
        }
      }
    }
    if (videoStage) { videoStage.hidden = true; videoStage.classList.add('hidden'); }
    if (videoThumb) videoThumb.hidden = !(videoUrl || item.videoKey);
    $('detailImage1').hidden = false;
    $('detailVideoMenu')?.classList.add('hidden');
    if ($('detailVideoMenu')) $('detailVideoMenu').hidden = true;
    if ($('detailVideoMenuButton')) $('detailVideoMenuButton').setAttribute('aria-expanded', 'false');
    if ($('detailVideoDownload')) {
      $('detailVideoDownload').href = videoUrl || '#';
      $('detailVideoDownload').download = videoUrl ? (videoUrl.split('/').pop().split('?')[0] || 'room-video.mp4') : 'room-video.mp4';
      $('detailVideoDownload').setAttribute('aria-disabled', String(!videoUrl));
    }
    const facilityNodes=$$('#detailFacilities span'); facilityNodes.forEach((node,index)=>{const value=(item.facilities||[])[index]; node.hidden=!value; if(value)node.textContent=value;});
    const contactEnabled=canContact(); $('detailContactLock').classList.toggle('hidden',contactEnabled); $$('[data-detail-action="call"],[data-detail-action="message"],[data-detail-action="whatsapp"]', $('detailContent')).forEach(x=>x.disabled=!contactEnabled);
    $('detailsModal').classList.remove('hidden');
  }
  function handleDetailAction(action){

  const id = state.pendingContactId;

  const item = listings().find(
    x => String(x.id) === String(id)
  );

  if(!item){
    toast('Property not found.');
    return;
  }

  const session = read(STORAGE.session,null);

  if(
    action === 'favorite' &&
    session?.role === 'owner'
  ){
    toast('Favorites are available for user accounts only.');
    return;
  }

  if(action === 'favorite'){
    return toggleFavourite(id);
  }

  if(action === 'share'){
    return shareProperty(id);
  }

  if(action === 'visit'){
    return requestVisit(id);
  }

  if(action === 'direction'){
    return openDirection(item);
  }

  if(
    ['call','message','whatsapp'].includes(action)
  ){

    if(!canContact()){
      return openContactUnlock(id);
    }

  if(action === 'message'){

  closeModal('detailsModal');

  return openRoomChat(item.id);

}

    const phone =
      action === 'whatsapp'
        ? item.ownerWhatsapp
        : item.ownerPhone;

    if(action === 'call'){
      window.location.href = `tel:${phone}`;
      return;
    }

    if(action === 'whatsapp'){
      window.open(
        `https://wa.me/91${phone}`,
        '_blank',
        'noopener'
      );
      return;
    }
  }
}
  function canContact(){ return true; }
  function requestVisit(id){const session=read(STORAGE.session,null);state.pendingContactId=id;$('visitName').value=session?.name||'';$('visitPhone').value=session?.phone||'';$('visitDate').min=today();$('visitDate').value=today();$('visitTime').value='17:00';$('visitMessage').value='';$('visitFormError').textContent='';$('visitModal').classList.remove('hidden');}
                                       /*===========================================================*/
    async function submitVisitRequest(event){
  event.preventDefault();

  const name = $('visitName').value.trim();
  const phone = $('visitPhone').value.replace(/\D/g,'');
  const date = $('visitDate').value;
  const time = $('visitTime').value;
  const comment = $('visitMessage').value.trim();
  const roomId = state.pendingContactId;

  if(
    name.length < 2 ||
    phone.length !== 10 ||
    !date ||
    !time
  ){
    $('visitFormError').textContent =
      'Please enter your name, valid phone, date and time.';
    return;
  }

  if(!window.supabaseClient){
    $('visitFormError').textContent =
      'Supabase is not connected.';
    return;
  }

  const session = read(STORAGE.session,null);

  if(!session?.phone){
    $('visitFormError').textContent =
      'Please login first.';
    return;
  }

  const room = listings().find(
    item => String(item.id) === String(roomId)
  );

  if(!room){
    $('visitFormError').textContent =
      'Property not found.';
    return;
  }

  /*
    Find previous visit requests for this
    user + room.
  */
  const {data:previous,error:previousError} =
    await window.supabaseClient
      .from('messages')
      .select('*')
      .eq('room_id',Number(roomId))
      .eq('user_phone',session.phone)
      .eq('message_type','visit')
      .order('created_at',{ascending:false});

  if(previousError){
    console.error('Previous Visit Load Error:',previousError);
    $('visitFormError').textContent =
      'Could not check previous visit requests.';
    return;
  }

  const requests = previous || [];

  const latest = requests[0];

  /*
    ACCEPTED REQUEST
    --------------------------------
    After accepted, user gets only
    2 additional attempts.
  */

  if(latest?.status === 'accepted'){

    const usedAttempts = Number(
      latest.visit_attempts || 0
    );

    if(usedAttempts >= 2){

      $('visitFormError').textContent =
        'You have used both additional visit attempts for this room.';

      return;
    }
  }

  /*
    REJECTED REQUEST
    --------------------------------
    Maximum 3 resend attempts.
  */

  if(latest?.status === 'rejected'){

    const usedResends = Number(
      latest.resend_count || 0
    );

    if(usedResends >= 3){

      $('visitFormError').textContent =
        'You have used all 3 attempts for this room visit request.';

      return;
    }
  }

  /*
    Calculate attempt counters.
  */

  let resendCount = 0;
  let visitAttempts = 0;

  if(latest){

    resendCount = Number(
      latest.resend_count || 0
    );

    visitAttempts = Number(
      latest.visit_attempts || 0
    );

    if(latest.status === 'rejected'){
      resendCount += 1;
    }

    if(latest.status === 'accepted'){
      visitAttempts += 1;
    }
  }

  /*
    Send new visit request.
  */

  try{
    await ensureChatAuth();
  }catch(error){
    console.error('Chat auth error:',error);
    toast('Chat connection failed. Please refresh and try again.');
    return;
  }

  const sendButton = $('messageComposer')?.querySelector('.chat-send-btn');
  if(sendButton) sendButton.disabled = true;

  const {error} =
    await window.supabaseClient
      .from('messages')
      .insert({

        room_id:Number(roomId),

        owner_id:room.ownerId || null,

        owner_phone:room.ownerPhone || '',

        user_phone:phone,

        user_name:name,

        sender_role:'user',

        message_type:'visit',

        text:comment || 'Room visit request',

        visit_date:date,

        visit_time:time,

        visit_comment:comment,

        status:'pending',

        resend_count:resendCount,

        visit_attempts:visitAttempts,

        parent_message_id:
          latest?.id || null,

        created_at:new Date().toISOString(),

        updated_at:new Date().toISOString()

      });

  if(error){

    console.error(
      'Visit Request Error:',
      error
    );

    $('visitFormError').textContent =
      'Visit request could not be sent.';
    if (visitSubmitButton) visitSubmitButton.disabled = false;
    return;
  }

  addNotification(
    `Visit request sent for ${room.title}.`,
    'visit'
  );

  closeModal('visitModal');

toast('Visit request sent successfully.');

await openRoomChat(roomId);
}            
                                       /*===========================================================*/
/* ROOM HUNT - SHARE PROPERTY */
async function shareProperty(id) {
  const item = listings().find(
    room => String(room.id) === String(id)
  );

  if (!item) {
    toast('Property not found.');
    return;
  }

  const shareUrl = new URL(window.location.href);
  shareUrl.search = '';
  shareUrl.hash = '';
  shareUrl.searchParams.set('room', String(item.id));

  const title = String(item.title || 'Room for Rent');
  const price = Number(item.price || 0).toLocaleString('en-IN');
  const suffix = String(item.suffix || '/ month');
  const location = String(item.location || 'Location not available');

  const message =
    `🏠 ${title}\n` +
    `💰 ₹${price} ${suffix}\n` +
    `📍 ${location}\n\n` +
    `View on Room Hunt:\n${shareUrl.href}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: title,
        text: message,
        url: shareUrl.href
      });
      return;
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Share error:', error);
    }
  }

  const whatsappUrl =
    'https://wa.me/?text=' + encodeURIComponent(message);

  window.open(
    whatsappUrl,
    '_blank',
    'noopener,noreferrer'
  );
}
  function openDirection(item){const destination=String(item?.location||'').trim();if(!destination){toast('Location is not available for this property yet.');return;}window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,'_blank','noopener,noreferrer');}

  /* =========================================================
     LOCATION
  ========================================================== */
  function useCurrentLocation(){

  if(!navigator.geolocation){
    toast('GPS location is not supported by this device.');
    return;
  }

  // User ko turant feedback
  state.currentLocation = 'Detecting location...';

  if($('homeSearch')){
    $('homeSearch').value = 'Detecting location...';
  }

  if($('headerLocation')){
    $('headerLocation').textContent = 'Detecting location...';
  }

  toast('Getting your current location...');

  navigator.geolocation.getCurrentPosition(

    async (position) => {

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      console.log('GPS Latitude:', latitude);
      console.log('GPS Longitude:', longitude);
      console.log('GPS Accuracy:', accuracy, 'meters');

      // GPS data save
      state.currentLatitude = latitude;
      state.currentLongitude = longitude;
      state.locationAccuracy = accuracy;

      // Actual location name find karo
      try {

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
        );

        if(!response.ok){
          throw new Error('Location service failed');
        }

        const data = await response.json();
        const address = data.address || {};

        const area =
          address.neighbourhood ||
          address.suburb ||
          address.residential ||
          address.village ||
          address.town ||
          address.city_district ||
          address.city ||
          'Current Location';

        const city =
          address.city ||
          address.town ||
          address.municipality ||
          '';

        const stateName =
          address.state || '';

        let locationName = area;

        if(city && city.toLowerCase() !== area.toLowerCase()){
          locationName += `, ${city}`;
        }

        if(stateName){
          locationName += `, ${stateName}`;
        }

        state.currentLocation = locationName;
        state.currentLatitude = latitude;
        state.currentLongitude = longitude;
        state.locationAccuracy = accuracy;
        updateListingDistances(latitude, longitude);

        // Search box update
        if($('homeSearch')){
          $('homeSearch').value = locationName;
        }

        // Header location update
        if($('headerLocation')){
          $('headerLocation').textContent = locationName;
        }

        // Filter location bhi update
        state.filters.location = locationName;
        renderHome();

        console.log('Detected Location:', locationName);
        console.log('Accuracy:', accuracy, 'meters');

        if(accuracy <= 30){
          toast(`Accurate location detected: ${locationName}`);
        }
        else if(accuracy <= 100){
          toast(`Location detected: ${locationName}`);
        }
        else{
          toast(`Location detected with lower accuracy: ${locationName}`);
        }

      }catch(error){

        console.error(
          'Reverse geocoding error:',
          error
        );

        // GPS mila hai, lekin naam nahi mila
        state.currentLocation =
          `Current Location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
        updateListingDistances(latitude, longitude);
        renderHome();

        if($('homeSearch')){
          $('homeSearch').value =
            state.currentLocation;
        }

        if($('headerLocation')){
          $('headerLocation').textContent =
            'Current Location';
        }

        toast(
          'GPS detected, but location name could not be loaded.'
        );
      }

    },

    (error) => {

      console.error(
        'GPS Error:',
        error
      );

      if(error.code === 1){

        toast(
          'Location permission denied. Please allow GPS permission.'
        );

      }
      else if(error.code === 2){

        toast(
          'GPS location is unavailable. Please turn ON Location.'
        );

      }
      else if(error.code === 3){

        toast(
          'GPS took too long. Please try again.'
        );

      }
      else{

        toast(
          'Unable to detect your current location.'
        );

      }
      state.currentLocation = '';
      if ($('homeSearch')?.value === 'Detecting location...') $('homeSearch').value = '';
      if ($('headerLocation')?.textContent === 'Detecting location...') $('headerLocation').textContent = 'Location unavailable';

    },

    {
      // IMPORTANT
      enableHighAccuracy: true,

      // Fresh location lene ki koshish
      maximumAge: 0,

      // Maximum 20 seconds wait
      timeout: 20000
    }

  );
}
  function usePropertyLocation(){
    if(!navigator.geolocation){toast('Location is not supported by this browser.');return;}
    toast('Getting property coordinates…');
    navigator.geolocation.getCurrentPosition(position=>{
      const value=`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
      $('propertyLocation').value=value;
      toast(`Property coordinates added (accuracy about ${Math.round(position.coords.accuracy)} m).`);
    },error=>{
      const message=error?.code===1?'Location permission denied. Allow location access in browser settings.':error?.code===3?'Location timed out. Try again in an open area.':'Could not get GPS location. Please try again.';
      toast(message);
    },{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  function addSearchPreference(location){if(!location)return;const arr=read(STORAGE.searches,[]);if(!arr.some(x=>x.toLowerCase()===location.toLowerCase()))arr.push(location);write(STORAGE.searches,arr.slice(-20));}

  /* =========================================================
     FILTER MODAL
  ========================================================== */
  function openFilter(){
    $('filterType').value=state.filters.type||state.homeType||'All'; $('filterLocation').value=state.filters.location; $('filterMin').value=state.filters.min; $('filterMax').value=state.filters.max; $('filterDistance').value=state.filters.distance; $('filterAvailability').value=state.filters.availability; setFacilityChecks('filterFacilities',state.filters.facilities); $('filterModal').classList.remove('hidden');
  }
  function applyFilter(){
    state.filters={type:$('filterType').value,location:$('filterLocation').value.trim(),min:$('filterMin').value,max:$('filterMax').value,distance:Number($('filterDistance').value),availability:$('filterAvailability').value,facilities:getCheckedFacilities('filterFacilities')}; state.homeType=state.filters.type; $$('.type-chip').forEach(x=>x.classList.toggle('active',x.dataset.homeType===state.homeType)); closeAllModals(); renderHome();
  }
  function resetFilter(){state.filters={type:'All',location:'',min:'',max:'',distance:5,availability:'available',facilities:[]};state.homeType='All';setFacilityChecks('filterFacilities',[]);$$('.type-chip').forEach(x=>x.classList.toggle('active',x.dataset.homeType==='All'));renderHome();}

  /* =========================================================
     OWNER POST / EDIT / VALIDATION
  ========================================================== */
  function openPost(id=null){
    const session=read(STORAGE.session,null); if(session?.role!=='owner'){ $('ownerSwitchModal').classList.remove('hidden'); return; }
    
  if(id){
  const owned=listings().find(x=>String(x.id)===String(id));if(!owned || String(owned.ownerId)!==String(session.ownerUid)){toast('You can only edit your own property.');return;}id = owned.id;}
    state.editingId=id; $('propertyForm').reset(); state.photos=[]; state.video=null; state.videoLoading=false; clearUploadPreviews(); setToday();
    if(id){const item=listings().find(x=>x.id===id);if(item)fillPostForm(item);} else {$('ownerName').value=read(STORAGE.session,null)?.name||'';updatePriceSuffix();updateAvailabilityUI();}
    $('propertyFormError').textContent=''; $('postModal').classList.remove('hidden');
  }
  function continueOwnerSwitch(){const session=read(STORAGE.session,null);state.role='owner';closeAllModals();localStorage.removeItem(STORAGE.session);showScreen('loginScreen');$('loginName').value=session?.name||'';$('loginPhone').value=session?.phone||'';$('loginError').textContent='Please verify with your Owner ID to publish a room.';}
  
function fillPostForm(item){

  $('propertyType').value = item.type || 'Room';

  $('propertyTitle').value = item.title || '';

  $('propertyPrice').value = item.price || '';

  $('postDate').value = item.postDate || today();

  $('propertyLocation').value = item.location || '';

  $('ownerName').value = item.ownerName || '';

  $('ownerPhone').value = item.ownerPhone || '';

  $('ownerWhatsapp').value = item.ownerWhatsapp || '';

  $('propertyDescription').value = item.description || '';

  $('propertyAvailable').checked = Boolean(item.available);

  $('availabilityWindow').value =
    item.availabilityWindow || '1 week';

  $('availabilityDate').value =
    item.availabilityDate || '';

  // Saved photos
  state.photos = (item.images || []).map(src => ({
    src,
    name: 'Saved property photo'
  }));

  // Saved video
  state.video = item.video
    ? {
        src: item.video,
        name: 'Property video'
      }
    : null;

  // Saved facilities
  setFacilityChecks(
    'propertyFacilities',
    item.facilities || []
  );

  updatePriceSuffix();

  updateAvailabilityUI();

  renderPhotoPreview();

  renderVideoPreview();
}


  function updatePriceSuffix(){const type=$('propertyType').value;$('priceSuffix').textContent=type==='Hotel'?'/ Day':(type==='Flat'||type==='House'?'Only':'/ month');}
  function updateAvailabilityUI(){const checked=$('propertyAvailable').checked;$('availabilityOptions').classList.toggle('hidden',checked);$('availabilityDate').classList.toggle('hidden',$('availabilityWindow').value!=='select date');}
  function validateProperty(){
    const errors=[]; if(!$('propertyType').value)errors.push('Select a property type.'); if(!$('propertyTitle').value.trim())errors.push('Enter a property title.'); if(!Number($('propertyPrice').value))errors.push('Enter a valid price.'); if(!$('postDate').value)errors.push('Select the post date.'); if(!$('propertyLocation').value.trim())errors.push('Enter the property location.'); if($('ownerPhone').value.replace(/\D/g,'').length!==10)errors.push('Enter a valid owner phone number.'); if($('ownerWhatsapp').value.replace(/\D/g,'').length!==10)errors.push('Enter a valid WhatsApp number.'); if(!$('propertyDescription').value.trim())errors.push('Add a property description.'); if(state.photos.length<3)errors.push('At least 3 property photos are required.'); if(state.photos.length>10)errors.push('Maximum 10 property photos are allowed.'); if(state.videoLoading)errors.push('Please wait for the video upload to finish.'); if(!$('propertyAvailable').checked&&$('availabilityWindow').value==='select date'&&!$('availabilityDate').value)errors.push('Select the future availability date.'); return errors;
  }
                                              /*-=============================================*/
          async function submitProperty(event){

  event.preventDefault();

  // Lock synchronously before any asynchronous upload/database work begins.
  if(state.isPublishing) return;

  const errors = validateProperty();

  $('propertyFormError').textContent =
    errors[0] || '';

  if(errors.length){

    toast(errors[0]);

    return;
  }


  const session =
    read(STORAGE.session, null);


  if(!session?.ownerUid){

    toast(
      'Owner security ID not found. Please login again.'
    );

    return;
  }


  if(!window.supabaseClient){

    toast(
      'Supabase is not connected.'
    );

    return;
  }


  if(session.role !== 'owner'){

    toast(
      'Only an owner account can publish a property.'
    );

    return;
  }


  const type =
    $('propertyType').value;


  const previous =
    state.editingId
      ? listings().find(
          x =>
            String(x.id) ===
            String(state.editingId)
        )
      : null;


  state.isPublishing = true;
  const publishButton = $('propertyForm')?.querySelector('button[type="submit"]');
  const previousPublishLabel = publishButton?.textContent || 'Publish Property';
  if(publishButton){
    publishButton.disabled = true;
    publishButton.setAttribute('aria-busy', 'true');
    publishButton.textContent = state.editingId ? 'Saving changes…' : 'Publishing…';
  }

  try{

    $('propertyFormError').textContent =
      state.editingId ? 'Saving property changes…' : 'Saving property…';


    /* ================================
       UPLOAD PHOTOS
    ================================= */

    const imageUrls =
      await prepareRoomImageUrls();


    /* ================================
       UPLOAD VIDEO
    ================================= */

    let videoUrl =
      previous?.video || '';


    if(state.video?.blob){

      state.videoLoading = true;
      state.videoUploadProgress = state.video.blob.size > 6 * 1024 * 1024 ? 0 : null;
      renderVideoPreview();
      const uploadLabel = $('videoUploadLabel');
      const uploadPercent = $('videoUploadPercent');
      if(uploadLabel) uploadLabel.textContent = `Uploading ${state.video.name || 'video'}…`;
      if(uploadPercent) uploadPercent.textContent = 'Uploading…';
      const uploadBar = $('videoUploadBar');
      if(uploadBar){ uploadBar.style.width = state.videoUploadProgress === null ? '24%' : '0%'; uploadBar.classList.toggle('is-indeterminate', state.videoUploadProgress === null); }

      try {
        videoUrl = await uploadRoomFile(
          state.video.blob,
          'videos',
          'room_video',
          percent => {
            state.videoUploadProgress = percent;
            if ($('propertyFormError')) $('propertyFormError').textContent = `Uploading video… ${percent}%`;
            if(uploadPercent) uploadPercent.textContent = `${percent}% uploaded`;
            if(uploadBar){ uploadBar.style.width = `${percent}%`; uploadBar.classList.remove('is-indeterminate'); }
          }
        );
        state.videoUploadProgress = 100;
        if(uploadPercent) uploadPercent.textContent = 'Upload complete';
        if(uploadBar){ uploadBar.style.width = '100%'; uploadBar.classList.remove('is-indeterminate'); }
      } finally {
        state.videoLoading = false;
        renderVideoPreview();
      }

    }else if(
      state.video?.src &&
      !state.video.src.startsWith('blob:')
    ){

      videoUrl =
        state.video.src;
    }


    /* ================================
       ROOM OBJECT
    ================================= */

    const item = {

      id:
        state.editingId ||
        uid('property'),

      title:
        $('propertyTitle').value.trim(),

      type,

      price:
        Number(
          $('propertyPrice').value
        ),

      suffix:
        $('priceSuffix').textContent,

      postDate:
        $('postDate').value,

      location:
        $('propertyLocation').value.trim(),

      city:
        extractCity(
          $('propertyLocation').value
        ),

      ...(() => {
        const coordinates = parseLocationCoordinates($('propertyLocation').value);
        return coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude } : { latitude: null, longitude: null };
      })(),

      distance: 0,

      facilities:
        getCheckedFacilities(
          'propertyFacilities'
        ),

      images:
        imageUrls,

      video:
        videoUrl,

      videoKey: '',

      ownerName:
        $('ownerName').value.trim(),

      ownerPhone:
        $('ownerPhone')
          .value
          .replace(/\D/g, ''),

      ownerWhatsapp:
        $('ownerWhatsapp')
          .value
          .replace(/\D/g, ''),

      ownerId:
        session.ownerUid,

      description:
        $('propertyDescription')
          .value
          .trim(),

      available:
        $('propertyAvailable')
          .checked,

      availabilityWindow:
        $('availabilityWindow').value,

      availabilityDate:
        $('availabilityDate').value,

      verified: true,

      createdAt:
        previous?.createdAt ||
        Date.now()
    };


    /* ================================
       SUPABASE DATA
    ================================= */

    const dbPayload = {

      title:
        item.title,

      "property-type":
        item.type,

      price:
        item.price,

      price_suffix:
        item.suffix,

      post_date:
        item.postDate || null,

      Location:
        item.location,

      // GPS coordinates are stored when the owner uses the location button.
      latitude: parseLocationCoordinates(item.location)?.latitude ?? null,
      longitude: parseLocationCoordinates(item.location)?.longitude ?? null,

      owner_name:
        item.ownerName,

      owner_phone:
        item.ownerPhone,

      owner_whatsapp:
        item.ownerWhatsapp,

      description:
        item.description,

      facilities:
        item.facilities,

      image_urls:
        item.images,

      video_url:
        item.video || null,

      available:
        item.available,

      availability_window:
        item.availabilityWindow || null,

      availability_date:
        item.availabilityDate || null,

      owner_id:
        session.ownerUid
    };


    let dbError = null;


    /* ================================
       EDIT EXISTING ROOM
    ================================= */

    if(state.editingId){

      const result =
        await window.supabaseClient
          .from("Room Hunt")
          .update(dbPayload)
          .eq(
            "id",
            Number(state.editingId)
          )
          .eq(
            "owner_id",
            session.ownerUid
          );

      dbError =
        result.error;

    }


    /* ================================
       ADD NEW ROOM
    ================================= */

    else{

      const result =
        await window.supabaseClient
          .from("Room Hunt")
          .insert(dbPayload)
          .select()
          .single();

      dbError =
        result.error;


      if(
        !dbError &&
        result.data
      ){

        item.id =
          result.data.id;

        item.createdAt =
          result.data.created_at ||
          item.createdAt;
      }
    }


    /* ================================
       DATABASE ERROR
    ================================= */

    if(dbError){

      console.error(
        'Supabase Room Save Error:',
        dbError
      );

      $('propertyFormError')
        .textContent =
          dbError.message;

      toast(
        'Room could not be saved to Supabase.'
      );

      return;
    }


    /* ================================
       LOCAL CACHE
    ================================= */

    const all =
      listings();

    const index =
      all.findIndex(
        x =>
          String(x.id) ===
          String(item.id)
      );


    if(index >= 0){

      all[index] =
        item;

    }else{

      all.unshift(item);
    }


    saveListings(all);


    addNotification(
      state.editingId
        ? 'Property updated successfully.'
        : 'Your property has been successfully uploaded on Room Hunt.',
      'property'
    );


    closeModal(
      'postModal'
    );


    $('successModal')
      .classList
      .remove('hidden');


    state.editingId =
      null;


    renderHome();

    renderProfile();


  }catch(error){

    console.error(
      'Supabase Room Save Error:',
      error
    );

    $('propertyFormError')
      .textContent =
        error?.message ||
        'Property could not be saved.';

    toast(
      'Property could not be saved to Supabase.'
    );
  } finally {
    state.isPublishing = false;
    if(publishButton){
      publishButton.disabled = false;
      publishButton.removeAttribute('aria-busy');
      publishButton.textContent = previousPublishLabel;
    }
    if(state.videoLoading){
      state.videoLoading = false;
      renderVideoPreview();
    }
  }
}                                    
                                              /*==============================================*/
  function finishPublish(){closeAllModals();showPage('home');toast('Property is now visible on Home');}
  function extractCity(location){const lower=location.toLowerCase();for(const city of ['Bhubaneswar','Koraput','Puri','Cuttack','Visakhapatnam'])if(lower.includes(city.toLowerCase()))return city;return location.split(',')[0].trim();}

/* Convert the GPS text filled by the location button into numeric coordinates. */
function parseLocationCoordinates(value){
  const match = String(value || '').trim().match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if(latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function distanceInKm(lat1, lon1, lat2, lon2){
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateListingDistances(latitude, longitude){
  const items = listings().map(item => {
    const lat = Number(item.latitude);
    const lon = Number(item.longitude);
    const hasCoordinates = item.latitude !== null && item.latitude !== undefined &&
      item.longitude !== null && item.longitude !== undefined &&
      Number.isFinite(lat) && Number.isFinite(lon);
    return { ...item, distance: hasCoordinates ? Number(distanceInKm(latitude, longitude, lat, lon).toFixed(2)) : 5 };
  });
  saveListings(items);
}
/* =========================================================
   SUPABASE STORAGE HELPERS
========================================================= */

function dataUrlToBlob(dataUrl){

  const parts = String(dataUrl).split(',');

  if(parts.length < 2){
    throw new Error('Invalid image data');
  }

  const match = parts[0].match(/data:([^;]+);base64/);

  const mime =
    match?.[1] ||
    'application/octet-stream';

  const binary = atob(parts[1]);

  const bytes =
    new Uint8Array(binary.length);

  for(let i = 0; i < binary.length; i++){
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob(
    [bytes],
    { type: mime }
  );
}


async function uploadRoomFile(file, folder, prefix, onProgress = null) {
  const client = window.supabaseClient;
  if (!client) throw new Error('Supabase is not connected.');
  if (!(file instanceof Blob) || !file.size) throw new Error('Selected file is empty or invalid.');

  const originalName = file.name || '';
  const extension = (originalName.split('.').pop() || file.type?.split('/')[1] || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
  const path = `${folder}/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { data: authData } = await client.auth.getSession();
  const accessToken = authData?.session?.access_token;

  // Large videos use resumable TUS uploads. Normal upload requests are not reliable for multi-GB files.
  if (folder === 'videos' && file.size > 6 * 1024 * 1024) {
    if (!window.tus?.Upload) throw new Error('Resumable video uploader could not load. Refresh the page and try again.');
    if (!accessToken) throw new Error('Supabase upload session missing. Please sign in again.');
    const projectUrl = window.ROOMHUNT_SUPABASE_URL;
    const publicKey = window.ROOMHUNT_SUPABASE_KEY;
    if (!projectUrl || !publicKey) throw new Error('Supabase upload configuration is incomplete.');
    await new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(file, {
        endpoint: `${projectUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 6 * 1024 * 1024,
        headers: { authorization: `Bearer ${accessToken}`, apikey: publicKey, 'x-upsert': 'false' },
        metadata: { bucketName: 'room-images', objectName: path, contentType: file.type || 'video/mp4', cacheControl: '3600' },
        onError: reject,
        onProgress: (uploaded, total) => { if (typeof onProgress === 'function') onProgress(Math.round(uploaded / total * 100)); },
        onSuccess: resolve
      });
      upload.findPreviousUploads().then(previous => { if (previous.length) upload.resumeFromPreviousUpload(previous[0]); upload.start(); }).catch(reject);
    });
  } else {
    const { error } = await client.storage.from('room-images').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream', cacheControl: '3600' });
    if (error) throw error;
  }

  const { data } = client.storage.from('room-images').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Could not create file URL.');
  return data.publicUrl;
}

async function prepareRoomImageUrls(){

  const urls = [];

  for(let i = 0; i < state.photos.length; i++){

    const photo = state.photos[i];

    if(!photo?.src) continue;

    // New photo
    if(photo.src.startsWith('data:')){

      const blob =
        dataUrlToBlob(photo.src);

      const url =
        await uploadRoomFile(
          blob,
          'photos',
          'room_photo'
        );

      urls.push(url);

    }else{

      // Already saved photo
      urls.push(photo.src);
    }
  }

  return urls;
}

  /* =========================================================
     PHOTO + VIDEO UPLOAD
  ========================================================== */
  async function handlePhotoFiles(event) {

  const files = Array.from(event.target.files || []);

  if (!files.length) return;

  const remainingSlots = 10 - state.photos.length;

  if (remainingSlots <= 0) {
    toast('Maximum 10 photos are already selected.');
    event.target.value = '';
    return;
  }

  const selectedFiles = files
    .filter(file => file.type && file.type.startsWith('image/'))
    .slice(0, remainingSlots);

  const invalidImages = files.filter(file => !file.type || !file.type.startsWith('image/'));
  if (invalidImages.length) toast('Non-image files were skipped.');

  if (!selectedFiles.length) {
    toast('Please select valid image files.');
    event.target.value = '';
    return;
  }

  if (selectedFiles.length < files.length) {
    toast(`Only ${selectedFiles.length} photo(s) added. Maximum 10 allowed.`);
  }

  try {

    const photoResults = await Promise.all(
      selectedFiles.map(file => {
        return new Promise((resolve, reject) => {

          const reader = new FileReader();

          reader.onload = () => {
            resolve({
              src: reader.result,
              name: file.name
            });
          };

          reader.onerror = () => {
            reject(reader.error || new Error('Photo could not be read.'));
          };

          reader.readAsDataURL(file);
        });
      })
    );

    state.photos.push(...photoResults);

    renderPhotoPreview();

    toast(`${state.photos.length} photo(s) selected.`);

  } catch (error) {

    console.error('Photo processing error:', error);

    toast('Some photos could not be loaded.');
  }

  event.target.value = '';
}
  function renderPhotoPreview(){const items=$$('.preview-item',$('photoPreview'));items.forEach((node,index)=>{const photo=state.photos[index];node.hidden=!photo;if(photo){node.querySelector('img').src=photo.src;node.querySelector('img').alt=`Property photo ${index+1}`;node.querySelector('.preview-delete').dataset.photoIndex=String(index);}});}
  function clearUploadPreviews(){
    $$('.preview-item',$('photoPreview')).forEach(x=>x.hidden=true); const videoPreview=$('videoPreview'); videoPreview?.querySelector('.video-card')?.classList.add('hidden'); const video=videoPreview?.querySelector('video'); if(video){video.pause();video.removeAttribute('src');video.load();}
  }
  function handleVideoFile(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(file.size>2*1024*1024*1024){toast('Each video must be 2 GB or smaller.');event.target.value='';return;}
    if(!file.type.startsWith('video/')){toast('Please choose a video file.');event.target.value='';return;}
    if(state.isPublishing){toast('Please wait until the current property save finishes.');event.target.value='';return;}
    const oldSrc = state.video?.src;
    if(oldSrc?.startsWith('blob:')) URL.revokeObjectURL(oldSrc);
    const previewURL=URL.createObjectURL(file);
    state.video={src:previewURL,name:file.name,blob:file};
    state.videoLoading=false;
    state.videoUploadProgress=null;
    renderVideoPreview();
    event.target.value='';
  }
  function deletePhoto(index){if(index<0||index>=state.photos.length)return;state.photos.splice(index,1);renderPhotoPreview();}
  function deleteVideo(){if(state.isPublishing){toast('Please wait until the video upload finishes.');return;}const oldSrc=state.video?.src;if(oldSrc?.startsWith('blob:'))URL.revokeObjectURL(oldSrc);state.video=null;state.videoLoading=false;state.videoUploadProgress=null;renderVideoPreview();}
  function renderVideoPreview(){
    const preview=$('videoPreview');
    if(!preview)return;
    const card=preview.querySelector('.video-card');
    const loader=preview.querySelector('.video-loader');
    const video=preview.querySelector('video');
    const del=preview.querySelector('.video-delete');
    if(!card)return;
    card.hidden=!state.video&&!state.videoLoading;
    if(loader)loader.hidden=!state.videoLoading;
    if(video)video.hidden=state.videoLoading||!state.video;
    if(del)del.hidden=state.videoLoading||!state.video;
    const percent=Number.isFinite(state.videoUploadProgress)?Math.max(0,Math.min(100,state.videoUploadProgress)):null;
    const percentNode=$('videoUploadPercent');
    const bar=$('videoUploadBar');
    if(percentNode && state.videoLoading && percent!==null)percentNode.textContent=`${percent}% uploaded`;
    if(bar && state.videoLoading && percent!==null){bar.style.width=`${percent}%`;bar.classList.remove('is-indeterminate');}
    if(video&&state.video?.src&&video.src!==state.video.src){video.src=state.video.src;video.load();}
  }

  /* =========================================================
     STATIC FACILITY CONTROLS
  ========================================================== */
  function getCheckedFacilities(group){return $$(`input[data-facility-group="${group}"]:checked`).map(x=>x.value);}
  function setFacilityChecks(group,values){const set=new Set(values);$$(`input[data-facility-group="${group}"]`).forEach(x=>x.checked=set.has(x.value));}

  /* =========================================================
     OWNER LISTINGS
  ========================================================== */
  function renderProfile(){
    const session=read(STORAGE.session,null);if(!session)return;updateUserUI(session);updateProfileStats();const own=listings().filter(x=>x.ownerId===session.ownerUid);$('ownerListings')?.classList.toggle('hidden',session.role!=='owner');
    const slots=$$('.owner-listing-slot',$('ownerListingCards')); if(!slots.length){ updateProfileStats(); return; }slots.forEach((slot,index)=>{const item=own[index];slot.hidden=!item;if(!item)return;slot.dataset.id=item.id;slot.querySelector('[data-ref="image"]').src=item.images?.[0]||DEMO_IMAGES[0];slot.querySelector('[data-ref="title"]').textContent=item.title;slot.querySelector('[data-ref="location"]').textContent=item.location;slot.querySelector('[data-ref="price"]').textContent=Number(item.price).toLocaleString('en-IN');slot.querySelector('[data-ref="suffix"]').textContent=item.suffix;slot.querySelector('[data-ref="status"]').textContent = String(item.type || 'Room').toUpperCase();slot.querySelector('[data-ref="availability"]').textContent=item.available?'● Available':'● Unavailable';slot.querySelector('[data-ref="availability"]').className=`listing-status ${item.available?'available':'unavailable'}`;slot.classList.toggle('unavailable-card',!item.available);});
    slots.forEach(slot=>{
  slot.addEventListener('click',e=>{
    if(e.target.closest('button')) return;

    const id=slot.dataset.id;
    if(id) openDetails(id);
  });
});
    if($('ownerListingsEmpty')) $('ownerListingsEmpty').hidden=own.length>0;
  }
  function updateProfileStats(){const session=read(STORAGE.session,null);if(!session)return;$('statFav').textContent=favourites().length;$('statListings').textContent=listings().filter(x=>x.ownerId===session.ownerUid).length;}
  function openDelete(id){state.pendingDeleteId=id;$('deleteModal').classList.remove('hidden');}
                                     /*===================================================*/
    async function confirmDelete(){

  const id = state.pendingDeleteId;
  const session = read(STORAGE.session, null);

  if(!id || !session?.ownerUid){
    toast('Owner security ID not found.');
    return;
  }

  const numericId = Number(id);

  if(!Number.isFinite(numericId)){
    toast('Invalid property ID. Please refresh and try again.');
    return;
  }

  const { error } = await window.supabaseClient
    .from("Room Hunt")
    .delete()
    .eq("id", numericId)
    .eq("owner_id", session.ownerUid);

  if(error){
    console.error("Supabase Delete Error:", error);
    toast("Room delete nahi hua.");
    return;
  }

  saveListings(
    listings().filter(x => String(x.id) !== String(id))
  );

  state.pendingDeleteId = null;
  closeAllModals();
  renderHome();
  renderProfile();

  addNotification('Property removed from Room Hunt.','property');
  toast('Property deleted');
}
                                     /*========================================*/

  function editProperty(id){openPost(id);}
/* =========================================================
   SUPABASE PROFILE
========================================================= */

async function loadProfileFromSupabase(phone){
  if(!phone || !window.supabaseClient) return null;

  const {data,error}=await window.supabaseClient
    .from('profiles')
    .select('*')
    .eq('phone',phone)
    .maybeSingle();

  if(error){
    console.error('Profile Load Error:',error);
    return null;
  }

  return data || null;
}


async function saveProfileToSupabase(session){
  if(!session?.phone || !window.supabaseClient) return;

  const {data,error}=await window.supabaseClient
    .from('profiles')
    .upsert({
      phone:session.phone,
      name:session.name || 'User',
      avatar_url:session.avatar || null,
      role:session.role || 'user',
      updated_at:new Date().toISOString()
    },{
      onConflict:'phone'
    })
    .select()
    .single();

  if(error){
    console.error('Profile Save Error:',error);
    return null;
  }

  return data;
}
                                         /*========================================*/




  /* =========================================================
     PROFILE
  ========================================================== */
  function openProfileEdit(){const session=read(STORAGE.session,null);if(!session)return;$('editName').value=session.name||'';$('profileModal').classList.remove('hidden');}
  
                                       /*========================================*/
      async function handleProfilePhoto(event){
  const file=event.target.files?.[0];
  if(!file)return;

  if(!file.type.startsWith('image/')){
    toast('Choose an image file.');
    event.target.value='';
    return;
  }

  if(file.size>5*1024*1024){
    toast('Profile photo must be 5 MB or smaller.');
    event.target.value='';
    return;
  }

  const session=read(STORAGE.session,null);

  if(!session?.phone){
    toast('Please login first.');
    event.target.value='';
    return;
  }

  if(!window.supabaseClient){
    toast('Supabase is not connected.');
    return;
  }

  try{

  /* Normal user ke liye bhi Supabase anonymous session */
  const client=window.supabaseClient;

  const {data:authData}=await client.auth.getSession();

  if(!authData?.session?.user?.id){
    const {error:authError}=await client.auth.signInAnonymously();

    if(authError) throw authError;
  }

  const safePhone=session.phone.replace(/\D/g,'');

    const fileExt=file.name.split('.').pop().toLowerCase();
    const filePath=`profiles/${safePhone}.${fileExt}`;

    const {error:uploadError}=await window.supabaseClient
      .storage
      .from('room-images')
      .upload(filePath,file,{
        upsert:true,
        contentType:file.type
      });

    if(uploadError)throw uploadError;

    const {data:urlData}=window.supabaseClient
      .storage
      .from('room-images')
      .getPublicUrl(filePath);

    const avatarUrl=`${urlData.publicUrl}?v=${Date.now()}`;
    session.avatar=avatarUrl;

    write(STORAGE.session,session);

    await saveProfileToSupabase(session);

    updateUserUI(session);

    toast('Profile photo saved permanently.');
  }catch(error){
    console.error('Profile Photo Upload Error:',error);
    toast('Profile photo upload failed.');
  }
}                                 
                                       /*========================================*/                      
  async function removeProfilePhoto(){
  const session=read(STORAGE.session,null);
  if(!session)return;

  session.avatar='👤';

  write(STORAGE.session,session);
  $('profilePhotoInput').value='';

  try{
    await saveProfileToSupabase(session);
  }catch(error){
    console.error('Profile Remove Save Error:',error);
  }

  updateUserUI(session);
  toast('Profile photo removed');
}
async function saveProfile(){
  const session=read(STORAGE.session,null);
  if(!session)return;

  session.name=$('editName').value.trim()||session.name;

  write(STORAGE.session,session);

  try{
    await saveProfileToSupabase(session);
  }catch(error){
    console.error('Profile Save Error:',error);
  }

  updateUserUI(session);
  closeAllModals();
  toast('Profile updated');
}
                                    /*========================================*/
  /* =========================================================
     SUBSCRIPTION + CONTACT UNLOCK
  ========================================================== */
  function openSubscription(){
    const title=$('paymentTitle');
    const description=$('paymentDescription');
    if(title) title.textContent='Room Hunt is free during launch';
    if(description) description.textContent='Search rooms, contact owners, request visits and open directions without a subscription. Paid plans are temporarily disabled.';
    $('subscriptionPlans')?.classList.add('hidden');
    $('qrArea')?.classList.add('hidden');
    const amount=$('paymentAmount'); if(amount) amount.textContent='₹0';
    const notice=$('paymentGatewayNotice');
    if(notice) notice.textContent='No payment is required during the free launch.';
    $('paymentModal')?.classList.remove('hidden');
  }
  function chooseSubscription(months){
    toast('Subscriptions are temporarily disabled. Room Hunt is free during launch.');
    closeModal('paymentModal');
  }
  function openContactUnlock(id){
    state.pendingContactId=id;
    toast('Contact access is free during launch — no subscription needed.');
    return true;
  }


  /* =========================================================
     SETTINGS + THEME + LOGOUT
  ========================================================== */
  function restoreTheme(){const savedTheme=read(STORAGE.theme,'light');document.body.classList.toggle('dark',savedTheme==='dark');syncThemeButton();}
  function toggleTheme(){document.body.classList.toggle('dark');write(STORAGE.theme,document.body.classList.contains('dark')?'dark':'light');syncThemeButton();}
  function syncThemeButton(){$('themeToggle')?.classList.toggle('on',document.body.classList.contains('dark'));}
  function toggleNotifications(){state.notificationsEnabled=!state.notificationsEnabled;write(STORAGE.notify,state.notificationsEnabled);$('notifyToggle').classList.toggle('on',state.notificationsEnabled);toast(state.notificationsEnabled?'Notifications enabled':'Notifications disabled');}
  function renderSettings(){syncThemeButton();$('notifyToggle')?.classList.toggle('on',state.notificationsEnabled);$('subscriptionStatus').textContent='Free during launch · no subscription required';}
  function restorePermissions(){const defaults={location:'Allowed',camera:'Allowed',files:'Allowed',sms:'Allowed',phone:'Allowed',contacts:'Not allowed',microphone:'Not allowed',notifications:'Not allowed',nearby:'Not allowed'};const saved=read(STORAGE.permissions,defaults);$$('[data-permission]').forEach(select=>{select.value=saved[select.dataset.permission]||defaults[select.dataset.permission]||'Ask every time';});}
  function savePermissions(){const settings={};$$('[data-permission]').forEach(select=>settings[select.dataset.permission]=select.value);write(STORAGE.permissions,settings);toast('Permission preferences saved');closeModal('securityModal');}
  function logout(){localStorage.removeItem(STORAGE.session);state.role='user';closeAllModals();showScreen('splashScreen');window.setTimeout(()=>showScreen('onboardingScreen'),800);}

  /* =========================================================
     NOTIFICATIONS + MESSAGES
  ========================================================== */
  function addNotification(text,type='general'){if(!state.notificationsEnabled)return;const list=notifications();list.unshift({id:uid('note'),text,type,createdAt:Date.now(),read:false});saveNotifications(list.slice(0,100));updateNotificationBadge();}
  function updateNotificationBadge(){const count=notifications().filter(x=>!x.read).length;$('notificationCount').textContent=count;if($('profileNotificationCount'))$('profileNotificationCount').textContent=count;$('profileNotificationCount')?.parentElement.classList.toggle('has-notifications',count>0);}
  function renderNotifications(){const list=notifications();const slots=$$('.notification-slot',$('notificationsList'));slots.forEach((slot,index)=>{const item=list[index];slot.hidden=!item;if(item){slot.dataset.id=item.id;slot.querySelector('[data-ref="text"]').textContent=item.text;slot.querySelector('[data-ref="time"]').textContent=new Date(item.createdAt).toLocaleString('en-IN');item.read=true;}});$('notificationsEmpty').hidden=list.length>0;saveNotifications(list);updateNotificationBadge();}
  function removeNotification(id){if(!id)return;saveNotifications(notifications().filter(item=>item.id!==id));renderNotifications();toast('Notification removed');}
  function clearNotifications(){saveNotifications([]);renderNotifications();toast('All notifications cleared');}
/* =========================================================
   ROOM HUNT — ROOM BASED MESSAGES
========================================================= */

function messageRoomHiddenKey(session){
  if(!session) return 'roomhunt_message_hidden_unknown';

  return session.role === 'owner'
    ? `roomhunt_message_hidden_owner_${session.ownerUid || session.phone}`
    : `roomhunt_message_hidden_user_${session.phone}`;
}


function getHiddenMessageRooms(session){
  try{
    return JSON.parse(
      localStorage.getItem(messageRoomHiddenKey(session)) || '{}'
    );
  }catch{
    return {};
  }
}


function saveHiddenMessageRooms(session,data){
  localStorage.setItem(
    messageRoomHiddenKey(session),
    JSON.stringify(data)
  );
}


function getRoomPhoto(room){

  if(!room) return '';

  let images =
    room.images ||
    room.imageUrls ||
    room.image_urls ||
    [];

  if(typeof images === 'string'){
    try{
      images = JSON.parse(images);
    }catch{
      return images;
    }
  }

  if(Array.isArray(images) && images.length){
    return images[0];
  }

  return room.image ||
         room.photo ||
         '';
}


function formatMessageTime(value){

  if(!value) return '';

  return new Date(value).toLocaleTimeString(
    'en-IN',
    {
      hour:'numeric',
      minute:'2-digit'
    }
  );
}


function formatMessageDate(value){

  if(!value) return '';

  return new Date(value).toLocaleString(
    'en-IN',
    {
      day:'numeric',
      month:'short',
      hour:'numeric',
      minute:'2-digit'
    }
  );
}


function getMessagePreview(message){

  if(!message){
    return 'No messages yet.';
  }

  if(message.message_type === 'visit'){

    if(message.status === 'accepted'){
      return '✓ Visit Request Accepted';
    }

    if(message.status === 'rejected'){
      return '✕ Visit Request Rejected';
    }

    return '🏠 Visit Request · Pending';
  }

  if(message.photo_url){
    return '📷 Photo';
  }

  if(message.text){
    return message.text;
  }

  return 'Message';
}


/* =========================================================
   MESSAGES MAIN PAGE
========================================================= */

async function renderMessages(){

  const session = read(STORAGE.session,null);

  if(!session?.loggedIn){

    $('messagesEmpty').hidden = false;
    $('messagesEmpty').textContent =
      'Please login first.';

    return;
  }

  if(!window.supabaseClient){

    $('messagesEmpty').hidden = false;
    $('messagesEmpty').textContent =
      'Supabase is not connected.';

    return;
  }


  let query =
    window.supabaseClient
      .from('messages')
      .select('*')
      .order('created_at',{ascending:false});


  /*
    USER:
    Sirf us user ke rooms.

    OWNER:
    Sirf us owner ke rooms.
  */

  if(session.role === 'owner'){

    query =
      query.eq(
        'owner_id',
        session.ownerUid
      );

  }else{

    query =
      query.eq(
        'user_phone',
        session.phone
      );
  }


  const {data,error} = await query;


  if(error){

    console.error(
      'Messages Load Error:',
      error
    );

    $('messagesEmpty').hidden = false;
    $('messagesEmpty').textContent =
      'Messages could not be loaded.';

    return;
  }


  const messages = data || [];


  /*
    ROOM ID KE ACCORDING GROUPING

    Example:

    Room 101 -> 10 messages
    Room 205 -> 5 messages

    Main page par:

    Room 101 -> 1 card
    Room 205 -> 1 card
  */

  const grouped = new Map();


  messages.forEach(message => {

    if(message.room_id === null ||
       message.room_id === undefined){

      return;
    }

    const roomId =
      String(message.room_id);

    if(!grouped.has(roomId)){
      grouped.set(roomId,[]);
    }

    grouped
      .get(roomId)
      .push(message);
  });


  const conversations =
    Array.from(grouped.entries())
      .map(([roomId,items]) => {

        items.sort(
          (a,b) =>
            new Date(b.created_at) -
            new Date(a.created_at)
        );

        return {
          roomId,
          messages:items,
          latest:items[0]
        };

      })
      .sort(
        (a,b) =>
          new Date(b.latest.created_at) -
          new Date(a.latest.created_at)
      );


  /*
    Removed room main page se hide rahega.

    Lekin agar us room me baad me
    naya message aaya, room automatically
    wapas aa jayega.
  */

  const hiddenRooms =
    getHiddenMessageRooms(session);


  const visibleConversations =
    conversations.filter(conversation => {

      const removedAt =
        Number(
          hiddenRooms[conversation.roomId] || 0
        );

      if(!removedAt){
        return true;
      }

      const latestTime =
        new Date(
          conversation.latest.created_at
        ).getTime();

      return latestTime > removedAt;
    });


  /*
    Owner profiles ek saath load.
  */

  const otherPartyPhones =
      [
        ...new Set(
          visibleConversations
            .map(x => session.role === 'owner' ? x.latest.user_phone : x.latest.owner_phone)
            .filter(Boolean)
        )
      ];


  let profileMap = new Map();


  if(otherPartyPhones.length){

    const {
      data:profiles
    } =
      await window.supabaseClient
        .from('profiles')
        .select(
          'phone,name,avatar_url'
        )
        .in(
          'phone',
          otherPartyPhones
        );


    (profiles || []).forEach(profile => {

      profileMap.set(
        String(profile.phone),
        profile
      );

    });
  }


  const slots =
    $$('.conversation-card',
      $('conversationList')
    );


  slots.forEach((slot,index) => {

    const conversation =
      visibleConversations[index];


    slot.hidden =
      !conversation;


    if(!conversation){

      slot.dataset.roomId = '';
      return;
    }


    const room =
      listings().find(
        item =>
          String(item.id) ===
          String(conversation.roomId)
      );


    const latest =
      conversation.latest;


    const otherPartyPhone = session.role === 'owner' ? latest.user_phone : latest.owner_phone;
    const profile = profileMap.get(String(otherPartyPhone || ''));


    /*
      USER:
      Owner ka naam.

      OWNER:
      User ka naam.
    */

    let displayName =
      session.role === 'owner'
        ? profile?.name || latest.user_name || 'User'
        : profile?.name ||
          room?.ownerName ||
          latest.user_name ||
          'Owner';


    let photo = profile?.avatar_url || '';


    const roomPhoto =
      getRoomPhoto(room);


    slot.dataset.roomId =
      String(conversation.roomId);


    const roomImage =
      slot.querySelector(
        '[data-ref="room-photo"]'
      );


    const roomFallback =
      slot.querySelector(
        '[data-ref="room-photo-fallback"]'
      );


    if(roomImage){

      roomImage.src =
        roomPhoto || '';

      roomImage.hidden =
        !roomPhoto;
    }


    if(roomFallback){

      roomFallback.hidden =
        Boolean(roomPhoto);
    }


    const ownerName =
      slot.querySelector(
        '[data-ref="owner-name"]'
      );


    if(ownerName){
      ownerName.textContent = displayName;
    }
    const conversationPhone = slot.querySelector('[data-ref="conversation-phone"]');
    if(conversationPhone){
      conversationPhone.textContent = session.role === 'owner' ? (otherPartyPhone || '') : '';
      conversationPhone.hidden = session.role !== 'owner' || !otherPartyPhone;
    }


    const title =
      slot.querySelector(
        '[data-ref="room-title"]'
      );


    if(title){

      title.textContent =
        room?.title ||
        `Room #${conversation.roomId}`;
    }


    const lastMessage =
      slot.querySelector(
        '[data-ref="last-message"]'
      );


    if(lastMessage){

      lastMessage.textContent =
        getMessagePreview(latest);
    }


    const time =
      slot.querySelector(
        '[data-ref="time"]'
      );


    if(time){

      time.textContent =
        formatMessageTime(
          latest.created_at
        );
    }


    const unread =
      slot.querySelector(
        '[data-ref="unread-count"]'
      );


    if(unread){
      unread.hidden = true;
    }

  });


  $('messagesEmpty').hidden =
    visibleConversations.length > 0;

}


/* =========================================================
   OPEN PARTICULAR ROOM CHAT
========================================================= */

async function openRoomChat(roomId){

  if(roomId === null ||
     roomId === undefined){

    toast('Room not found.');
    return;
  }


  const session =
    read(STORAGE.session,null);


  if(!session?.loggedIn){

    toast('Please login first.');
    return;
  }


  state.activeMessageRoomId = roomId;
  if (state.chatRealtimeChannel && window.supabaseClient) { window.supabaseClient.removeChannel(state.chatRealtimeChannel).catch?.(() => {}); state.chatRealtimeChannel = null; }
  if (window.supabaseClient?.channel) {
    state.chatRealtimeChannel = window.supabaseClient.channel(`room-chat-${String(roomId)}-${String(read(STORAGE.session, null)?.phone || 'session')}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${Number(roomId)}` }, () => { if (String(state.activeMessageRoomId) === String(roomId)) { renderRoomChat(); renderMessages(); } })
      .subscribe();
  }


  /*
    Agar room user ne direct room details se
    open kiya hai, hidden state remove.
  */

  const hiddenRooms =
    getHiddenMessageRooms(session);


  delete hiddenRooms[String(roomId)];

  saveHiddenMessageRooms(
    session,
    hiddenRooms
  );


  /*
    Messages page ensure.
  */

  showPage('messages');


  $('messagesHome')
    ?.classList
    .add('hidden');


  $('roomChatPage')
    ?.classList
    .remove('hidden');


  await renderRoomChat();
}


/* =========================================================
   CLOSE ROOM CHAT
========================================================= */

function closeRoomChat(){
  if (state.chatRealtimeChannel && window.supabaseClient) { window.supabaseClient.removeChannel(state.chatRealtimeChannel).catch?.(() => {}); state.chatRealtimeChannel = null; }

  $('roomChatPage')
    ?.classList
    .add('hidden');


  $('messagesHome')
    ?.classList
    .remove('hidden');


  state.activeMessageRoomId =
    null;


  state.pendingMessageId =
    null;


  closeMessageContextMenu();


  renderMessages();
}


/* =========================================================
   ROOM CHAT
========================================================= */

async function renderRoomChat(){

  const session =
    read(STORAGE.session,null);


  const roomId =
    state.activeMessageRoomId;


  if(!session?.loggedIn ||
     roomId === null ||
     roomId === undefined){

    return;
  }


  const room =
    listings().find(
      item =>
        String(item.id) ===
        String(roomId)
    );


  let query =
    window.supabaseClient
      .from('messages')
      .select('*')
      .eq(
        'room_id',
        Number(roomId)
      )
      .order(
        'created_at',
        {ascending:true}
      );


  if(session.role === 'owner'){

    query =
      query.eq(
        'owner_id',
        session.ownerUid
      );

  }else{

    query =
      query.eq(
        'user_phone',
        session.phone
      );
  }


  const {data,error} =
    await query;


  if(error){

    console.error(
      'Room Chat Load Error:',
      error
    );

    toast('Chat could not be loaded.');
    return;
  }


  const messages =
    data || [];


  const latest =
    messages[messages.length - 1];


  /*
    Header profile.
  */

  const otherPhone =
    session.role === 'owner'
      ? latest?.user_phone || ''
      : room?.ownerPhone || latest?.owner_phone || '';


  let profile = null;


  if(otherPhone){

    const result =
      await window.supabaseClient
        .from('profiles')
        .select(
          'phone,name,avatar_url'
        )
        .eq(
          'phone',
          otherPhone
        )
        .maybeSingle();


    profile =
      result.data || null;
  }


  const headerName =
    session.role === 'owner'
      ? profile?.name || latest?.user_name || 'User'
      : profile?.name || room?.ownerName || 'Owner';

  const headerPhoto = profile?.avatar_url || '';
  const chatSubtitle = $('chatContactSubtitle');
  const chatRoomName = $('chatRoomName');
  $('chatOwnerName').textContent = headerName;

  if(session.role === 'owner'){
    if(chatSubtitle){
      chatSubtitle.textContent = otherPhone ? `+91 ${otherPhone}` : 'User';
      chatSubtitle.hidden = false;
    }
    if(chatRoomName){
      chatRoomName.textContent = room?.title || `Room #${roomId}`;
      chatRoomName.hidden = false;
    }
  }else{
    if(chatSubtitle){ chatSubtitle.hidden = true; chatSubtitle.textContent = ''; }
    if(chatRoomName){
      chatRoomName.textContent = room?.title || `Room #${roomId}`;
      chatRoomName.hidden = false;
    }
  }


  const avatar =
    $('chatOwnerAvatar');


  const avatarFallback =
    $('chatOwnerAvatarFallback');


  if(avatar){
    avatar.onerror = () => { avatar.hidden = true; if(avatarFallback) avatarFallback.hidden = false; };
    avatar.src = headerPhoto;
    avatar.hidden = !headerPhoto;
  }


  if(avatarFallback){

    avatarFallback.hidden =
      Boolean(headerPhoto);
  }


  /*
    Latest 20 messages.
  */

  const visibleMessages =
    messages.slice(-20);


  const slots =
    $$('.chat-message-slot',
      $('roomChatMessages')
    );


  slots.forEach(
    slot => {

      slot.hidden = true;

      slot.dataset.id = '';

      slot.classList.remove(
        'is-own',
        'is-other'
      );

    }
  );


  visibleMessages.forEach(
    (message,index) => {

      const slot =
        slots[index];


      if(!slot) return;


      slot.hidden = false;

      slot.dataset.id =
        String(message.id);


      const isOwn =
        message.sender_role ===
        session.role;


      slot.classList.toggle(
        'is-own',
        isOwn
      );


      slot.classList.toggle(
        'is-other',
        !isOwn
      );


      const bubble =
        slot.querySelector(
          '[data-ref="chat-bubble"]'
        );


      const visitCard =
        slot.querySelector(
          '[data-ref="visit-card"]'
        );


      /*
        Visit request
      */

      if(message.message_type === 'visit'){

        if(bubble){
          bubble.hidden = true;
        }

        if(visitCard){

          visitCard.hidden = false;


          const detail =
            visitCard.querySelector(
              '[data-ref="visit-detail"]'
            );


          const status =
            visitCard.querySelector(
              '[data-ref="visit-status"]'
            );


          const reason =
            visitCard.querySelector(
              '[data-ref="visit-reason"]'
            );


          if(detail){

            detail.textContent =
              `${message.visit_date || ''} · ` +
              `${message.visit_time || ''}` +
              (
                message.visit_comment
                  ? ` · ${message.visit_comment}`
                  : ''
              );
          }


          if(status){

            if(message.status === 'accepted'){

              status.textContent =
                '✓ Visit Accepted';

              status.style.color =
                '#0b8d42';

            }else if(
              message.status === 'rejected'
            ){

              status.textContent =
                '✕ Visit Rejected';

              status.style.color =
                '#d72638';

            }else{

              status.textContent =
                '● Pending';

              status.style.color =
                '#b45a00';
            }
          }


          if(reason){

            reason.textContent =
              message.visit_outcome
                ? `Reason: ${message.visit_outcome}`
                : '';
          }


          const accept =
            visitCard.querySelector(
              '[data-message-action="accept"]'
            );


          const reject =
            visitCard.querySelector(
              '[data-message-action="reject"]'
            );


          const resend =
            visitCard.querySelector(
              '[data-message-action="resend"]'
            );


          const contact =
            visitCard.querySelector(
              '[data-message-action="contact"]'
            );


          if(accept){

            accept.hidden =
              !(
                session.role === 'owner' &&
                message.status === 'pending'
              );
          }


          if(reject){

            reject.hidden =
              !(
                session.role === 'owner' &&
                message.status === 'pending'
              );
          }


          if(resend){

            resend.hidden =
              !(
                session.role === 'user' &&
                message.status === 'rejected' &&
                Number(message.resend_count || 0) < 3
              );
          }


          if(contact){

            contact.hidden =
              !(
                session.role === 'user' &&
                message.status === 'rejected' &&
                Number(message.resend_count || 0) >= 3
              );
          }

        }

        return;
      }


      /*
        Normal chat
      */

      if(visitCard){
        visitCard.hidden = true;
      }


      if(!bubble) return;


      bubble.hidden = false;


      const text =
        bubble.querySelector(
          '[data-ref="chat-text"]'
        );


      const photo =
        bubble.querySelector(
          '[data-ref="chat-photo"]'
        );


      const time =
        bubble.querySelector(
          '[data-ref="chat-time"]'
        );


      const status =
        bubble.querySelector(
          '[data-ref="chat-status"]'
        );


      if(text){

        text.textContent =
          message.text ||
          (
            message.photo_url
              ? 'Photo'
              : ''
          );
      }


      if(photo){

        photo.src =
          message.photo_url || '';

        photo.classList.toggle(
          'hidden',
          !message.photo_url
        );
      }


      if(time){

        time.textContent =
          formatMessageTime(
            message.created_at
          );
      }


      if(status){

        status.textContent =
          message.status === 'deleted'
            ? 'Deleted'
            : (
              isOwn
                ? '✓'
                : ''
            );
      }

    }
  );


  const chatBox =
    $('roomChatMessages');


  if(chatBox){

    requestAnimationFrame(() => {

      chatBox.scrollTop =
        chatBox.scrollHeight;

    });
  }

}


/* =========================================================
   CHAT CONNECTION + FEEDBACK HELPERS
========================================================= */
async function ensureChatAuth(){
  const client = window.supabaseClient;
  if(!client) throw new Error('Supabase is not connected.');
  const {data} = await client.auth.getSession();
  if(data?.session?.user?.id) return data.session.user.id;
  const {data:authData,error} = await client.auth.signInAnonymously();
  if(error) throw error;
  return authData?.user?.id || null;
}

function setFeedbackDefaults(){
  const session = read(STORAGE.session,null);
  if($('feedbackName')) $('feedbackName').value = session?.name || '';
  if($('feedbackText')) $('feedbackText').focus();
}

async function submitFeedback(event){
  event.preventDefault();
  const text = $('feedbackText')?.value.trim() || '';
  const name = $('feedbackName')?.value.trim() || 'Room Hunt User';
  if(!text){
    $('feedbackFormError').textContent = 'Please write your feedback.';
    return;
  }
  $('feedbackFormError').textContent = 'Opening your email app...';
  const subject = encodeURIComponent(`Room Hunt Feedback — ${name}`);
  const body = encodeURIComponent(`Name: ${name}\n\nFeedback:\n${text}\n\nSent from Room Hunt.`);
  const mailto = `mailto:sarojnaik931@gmail.com?subject=${subject}&body=${body}`;
  try{
    if(window.supabaseClient){
      await window.supabaseClient.from('feedback').insert({name,feedback:text,created_at:new Date().toISOString()});
    }
  }catch(error){
    console.warn('Feedback database save skipped:',error);
  }
  window.location.href = mailto;
  $('feedbackFormError').textContent = 'Feedback prepared for sarojnaik931@gmail.com.';
  toast('Feedback ready to send.');
}

/* =========================================================
   SEND NORMAL CHAT MESSAGE
========================================================= */

async function sendChatMessage(){
  const input = $('messageInput');
  const sendButton = $('messageComposer')?.querySelector('.chat-send-btn');
  const text = input?.value.trim();
  if (!text) { toast('Please write a message.'); return; }
  const session = read(STORAGE.session, null);
  if (!session?.loggedIn) { toast('Please login first.'); return; }
  const roomId = state.activeMessageRoomId;
  if (roomId === null || roomId === undefined) { toast('Please open a room chat first.'); return; }
  const room = listings().find(item => String(item.id) === String(roomId));
  if (!room) { toast('Property not found.'); return; }
  if (!window.supabaseClient) { toast('Chat database is not connected.'); return; }
  if (sendButton) sendButton.disabled = true;
  try {
    await ensureChatAuth();
    const { error } = await window.supabaseClient.from('messages').insert({
      room_id: Number(roomId),
      owner_id: room.ownerId || null,
      owner_phone: room.ownerPhone || '',
      user_phone: session.phone || '',
      user_name: session.name || 'User',
      sender_role: session.role || 'user',
      message_type: 'chat',
      text,
      status: 'sent',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    input.value = '';
    await renderRoomChat();
    await renderMessages();
  } catch (error) {
    console.error('Chat Send Error:', error);
    toast('Message could not be sent. Check Supabase messages table, authentication and RLS policies.');
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

/* =========================================================
   CHAT PHOTO
========================================================= */

async function handleMessagePhoto(event){

  const file =
    event.target.files?.[0];


  event.target.value = '';


  if(!file) return;


  if(!file.type.startsWith('image/')){

    toast('Choose an image file.');
    return;
  }


  if(file.size > 5 * 1024 * 1024){

    toast('Photo must be 5 MB or smaller.');
    return;
  }


  const session =
    read(STORAGE.session,null);


  const roomId =
    state.activeMessageRoomId;


  if(!session?.loggedIn ||
     roomId === null ||
     roomId === undefined){

    toast('Please open a room first.');
    return;
  }


  const room =
    listings().find(
      item =>
        String(item.id) ===
        String(roomId)
    );


  if(!room){

    toast('Room not found.');
    return;
  }


  try{
    await ensureChatAuth();
  }catch(error){
    console.error('Chat photo auth error:',error);
    toast('Chat connection failed. Please refresh and try again.');
    return;
  }

  const safeName =
    file.name
      .replace(/[^a-zA-Z0-9._-]/g,'_');


  const path =
    `chat/${session.phone || session.ownerUid || 'user'}/${roomId}/${Date.now()}_${safeName}`;


  const {error:uploadError} =
    await window.supabaseClient
      .storage
      .from('room-images')
      .upload(
        path,
        file,
        {
          cacheControl:'3600',
          upsert:false,
          contentType:file.type
        }
      );


  if(uploadError){

    console.error(
      'Chat Photo Upload Error:',
      uploadError
    );

    toast('Photo could not be uploaded.');
    return;
  }


  const {
    data:publicData
  } =
    window.supabaseClient
      .storage
      .from('room-images')
      .getPublicUrl(path);


  const photoUrl =
    publicData?.publicUrl || '';


  if(!photoUrl){

    toast('Photo URL could not be created.');
    return;
  }


  const {error} =
    await window.supabaseClient
      .from('messages')
      .insert({

        room_id:Number(roomId),

        owner_id:
          room.ownerId || null,

        owner_phone:
          room.ownerPhone || '',

        user_phone:
          session.phone || '',

        user_name:
          session.name || 'User',

        sender_role:
          session.role || 'user',

        message_type:'chat',

        text:'Photo',

        photo_url:photoUrl,

        status:'sent',

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString()

      });


  if(error){

    console.error(
      'Chat Photo Message Error:',
      error
    );

    toast('Photo message could not be saved.');
    return;
  }


  await renderRoomChat();
  await renderMessages();

  toast('Photo sent.');
}


/* =========================================================
   SHARE LOCATION
========================================================= */

async function shareChatLocation(){

  const session =
    read(STORAGE.session,null);


  const roomId =
    state.activeMessageRoomId;


  if(!session?.loggedIn ||
     roomId === null ||
     roomId === undefined){

    toast('Open a room chat first.');
    return;
  }


  if(!navigator.geolocation){

    toast(
      'Location is not supported by this browser.'
    );

    return;
  }


  const room =
    listings().find(
      item =>
        String(item.id) ===
        String(roomId)
    );


  if(!room){

    toast('Room not found.');
    return;
  }


  navigator.geolocation.getCurrentPosition(

    async position => {

      const url =
        `https://maps.google.com/?q=` +
        `${position.coords.latitude},` +
        `${position.coords.longitude}`;


      const {error} =
        await window.supabaseClient
          .from('messages')
          .insert({

            room_id:Number(roomId),

            owner_id:
              room.ownerId || null,

            owner_phone:
              room.ownerPhone || '',

            user_phone:
              session.phone || '',

            user_name:
              session.name || 'User',

            sender_role:
              session.role || 'user',

            message_type:'chat',

            text:
              `📍 Location: ${url}`,

            status:'sent',

            created_at:
              new Date().toISOString(),

            updated_at:
              new Date().toISOString()

          });


      if(error){

        console.error(
          'Location Message Error:',
          error
        );

        toast('Location could not be sent.');
        return;
      }


      await renderRoomChat();
      await renderMessages();

      toast('Location sent.');

    },

    () => {

      toast(
        'Location permission was not granted.'
      );

    }
  );

}


/* =========================================================
   REMOVE ROOM FROM MESSAGES MAIN PAGE
========================================================= */

function removeConversationRoom(roomId){

  const session =
    read(STORAGE.session,null);


  if(!session ||
     roomId === null ||
     roomId === undefined){

    return;
  }


  const hiddenRooms =
    getHiddenMessageRooms(session);


  hiddenRooms[String(roomId)] =
    Date.now();


  saveHiddenMessageRooms(
    session,
    hiddenRooms
  );


  if(
    String(state.activeMessageRoomId) ===
    String(roomId)
  ){

    closeRoomChat();
    return;
  }


  renderMessages();

  toast('Conversation removed from Messages.');
}


/* =========================================================
   CHAT ACTIONS
========================================================= */

function handleChatAction(action){

  if(action === 'photo'){

    $('messagePhotoInput')?.click();
    return;
  }


  if(action === 'location'){

    shareChatLocation();
    return;
  }

}


/* =========================================================
   EDIT / DELETE / VISIT ACTIONS
========================================================= */

async function handleMessageAction(action,button){

  const session =
    read(STORAGE.session,null);


  if(!session?.loggedIn){

    toast('Please login first.');
    return;
  }


  let id =
    button?.closest(
      '.chat-message-slot'
    )?.dataset.id;


  if(!id){

    id =
      state.pendingMessageId;
  }


  if(!id) return;


  closeMessageContextMenu();


  const {data:message,error:loadError} =
    await window.supabaseClient
      .from('messages')
      .select('*')
      .eq(
        'id',
        Number(id)
      )
      .maybeSingle();


  if(loadError || !message){

    toast('Message not found.');
    return;
  }


  const roomId =
    message.room_id;


  /*
    NORMAL MESSAGE EDIT
  */

  if(action === 'edit'){

    if(
      message.message_type !== 'chat' ||
      message.sender_role !== session.role
    ){

      toast(
        'You can edit only your own message.'
      );

      return;
    }


    const editedText =
      window.prompt(
        'Edit your message:',
        message.text || ''
      );


    if(editedText === null){
      return;
    }


    if(!editedText.trim()){

      toast(
        'Message cannot be empty.'
      );

      return;
    }


    const {error} =
      await window.supabaseClient
        .from('messages')
        .update({

          text:
            editedText.trim(),

          updated_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          Number(id)
        );


    if(error){

      console.error(
        'Edit Message Error:',
        error
      );

      toast('Message could not be edited.');
      return;
    }


    await renderRoomChat();
    await renderMessages();

    toast('Message edited.');

    return;
  }


  /*
    NORMAL MESSAGE DELETE

    Hard delete nahi.
    WhatsApp style:
    "This message was deleted"
  */

  if(action === 'remove'){

    if(
      message.message_type !== 'chat' ||
      message.sender_role !== session.role
    ){

      toast(
        'You can delete only your own message.'
      );

      return;
    }


    const {error} =
      await window.supabaseClient
        .from('messages')
        .update({

          text:
            'This message was deleted',

          photo_url:null,

          status:'deleted',

          updated_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          Number(id)
        );


    if(error){

      console.error(
        'Delete Message Error:',
        error
      );

      toast('Message could not be deleted.');
      return;
    }


    await renderRoomChat();
    await renderMessages();

    toast('Message deleted.');

    return;
  }


  /*
    OWNER ACCEPT
  */

  if(action === 'accept'){

    if(
      session.role !== 'owner' ||
      message.message_type !== 'visit'
    ){

      return;
    }


    const {error} =
      await window.supabaseClient
        .from('messages')
        .update({

          status:'accepted',

          updated_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          Number(id)
        );


    if(error){

      toast(
        'Visit request could not be accepted.'
      );

      return;
    }


    addNotification(
      'Visit request accepted.',
      'visit'
    );


    await renderRoomChat();
    await renderMessages();

    toast('Visit request accepted.');

    return;
  }


  /*
    OWNER REJECT
  */

  if(action === 'reject'){

    if(
      session.role !== 'owner' ||
      message.message_type !== 'visit'
    ){

      return;
    }


    const reason =
      window.prompt(
        'Reason for rejecting this visit:',
        'Sorry, this time is not available.'
      );


    if(!reason?.trim()){
      return;
    }


    const {error} =
      await window.supabaseClient
        .from('messages')
        .update({

          status:'rejected',

          visit_outcome:
            reason.trim(),

          updated_at:
            new Date().toISOString()

        })
        .eq(
          'id',
          Number(id)
        );


    if(error){

      toast(
        'Visit request could not be rejected.'
      );

      return;
    }


    addNotification(
      'Visit request rejected.',
      'visit'
    );


    await renderRoomChat();
    await renderMessages();

    toast('Visit request rejected.');

    return;
  }


  /*
    USER RESEND
  */

  if(action === 'resend'){

    if(
      session.role !== 'user' ||
      message.message_type !== 'visit'
    ){

      return;
    }


    state.activeMessageRoomId =
      roomId;


    await requestVisit(roomId);

    return;
  }


  /*
    USER CONTACT OWNER
  */

  if(action === 'contact'){

    if(
      session.role !== 'user'
    ){

      return;
    }


    state.pendingContactId =
      roomId;


    openContactUnlock(roomId);

    return;
  }

}


/* =========================================================
   LONG PRESS MENU
========================================================= */

function closeMessageContextMenu(){

  const menu =
    $('messageContextMenu');


  if(menu){

    menu.hidden = true;
  }

  state.pendingMessageId =
    null;
}


function showMessageContextMenu(slot){

  if(!slot) return;


  const id =
    slot.dataset.id;


  if(!id) return;


  state.pendingMessageId =
    id;


  const menu =
    $('messageContextMenu');


  if(!menu) return;


  const rect =
    slot.getBoundingClientRect();


  menu.style.top =
    `${Math.max(10,rect.top - 5)}px`;


  menu.style.left =
    `${Math.max(
      10,
      Math.min(
        window.innerWidth - 145,
        rect.right - 135
      )
    )}px`;


  menu.hidden = false;
}


function bindMessageGestures(){

  const container =
    $('roomChatMessages');


  if(!container) return;


  let timer = null;
  let target = null;
  let startX = 0;
  let startY = 0;


  const cancel = () => {

    if(timer){

      clearTimeout(timer);
      timer = null;
    }

    target = null;
  };


  container.addEventListener(
    'pointerdown',
    event => {

      const slot =
        event.target.closest(
          '.chat-message-slot'
        );


      if(!slot || slot.hidden){
        return;
      }


      const session =
        read(STORAGE.session,null);


      const id =
        slot.dataset.id;


      if(!id || !session){
        return;
      }


      startX =
        event.clientX;


      startY =
        event.clientY;


      target =
        slot;


      timer =
        setTimeout(
          async () => {

            const {data:message} =
              await window.supabaseClient
                .from('messages')
                .select(
                  'id,message_type,sender_role'
                )
                .eq(
                  'id',
                  Number(id)
                )
                .maybeSingle();


            if(
              message &&
              message.message_type === 'chat' &&
              message.sender_role === session.role
            ){

              showMessageContextMenu(
                target
              );
            }


            timer = null;

          },
          600
        );

    }
  );


  container.addEventListener(
    'pointermove',
    event => {

      if(
        Math.abs(event.clientX - startX) > 10 ||
        Math.abs(event.clientY - startY) > 10
      ){

        cancel();
      }

    }
  );


  container.addEventListener(
    'pointerup',
    cancel
  );


  container.addEventListener(
    'pointercancel',
    cancel
  );


  container.addEventListener(
    'contextmenu',
    event => {

      const slot =
        event.target.closest(
          '.chat-message-slot'
        );


      if(!slot) return;


      event.preventDefault();

      showMessageContextMenu(
        slot
      );

    }
  );

}
    /* =========================================================
     GALLERY + TOUCH INTERACTIONS
  ========================================================== */
  function toggleDetailMore(button){const panel=$('detailMoreContent');if(!panel||!button)return;const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);button.textContent=opening?'View less':'View more…';button.setAttribute('aria-expanded',String(opening));}
  function showDetailVideoInGallery() {
    const video = $('detailVideo');
    const stage = $('detailVideoStage');
    const main = $('detailImage1');
    if (!video || !stage || !main || $('detailVideoThumb')?.hidden) return;
    video.pause();
    main.hidden = true;
    stage.hidden = false;
    stage.classList.remove('hidden');
    video.hidden = false;
    video.classList.remove('hidden');
    // Do not autoplay; the visitor deliberately presses the native Play control.
  }

  function toggleDetailVideoMenu() {
    const menu = $('detailVideoMenu');
    const button = $('detailVideoMenuButton');
    if (!menu || !button) return;
    const opening = menu.hidden || menu.classList.contains('hidden');
    menu.hidden = !opening;
    menu.classList.toggle('hidden', !opening);
    button.setAttribute('aria-expanded', String(opening));
  }

  async function handleDetailVideoMenuAction(event) {
    const button = event.target.closest('[data-video-action]');
    if (!button) return;
    const video = $('detailVideo');
    const stage = $('detailVideoStage');
    if (!video || !stage) return;
    const action = button.dataset.videoAction;
    const menu = $('detailVideoMenu');
    if (menu) { menu.hidden = true; menu.classList.add('hidden'); }
    $('detailVideoMenuButton')?.setAttribute('aria-expanded', 'false');
    if (action === 'pip') {
      try {
        if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          await video.requestPictureInPicture();
        } else {
          toast('Picture-in-Picture is not supported by this browser.');
        }
      } catch (error) {
        console.error('Picture-in-Picture could not start:', error);
        toast('Picture-in-Picture is not available right now.');
      }
    } else if (action === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (stage.requestFullscreen) await stage.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else toast('Fullscreen is not supported by this browser.');
      } catch (error) {
        console.error('Fullscreen could not start:', error);
        toast('Fullscreen could not be opened.');
      }
    }
  }

  function handleGalleryImageClick(event){
    const thumb=event.target.closest('#detailContent .detail-gallery .detail-thumbs img');
    if(!thumb || thumb.hidden || !thumb.src) return;
    const main=$('detailImage1');
    const video=$('detailVideo');
    const stage=$('detailVideoStage');
    if(!main) return;
    if(video) video.pause();
    if(stage){stage.hidden=true;stage.classList.add('hidden');}
    main.hidden=false;
    main.classList.remove('hidden');
    const previous=main.src;
    main.src=thumb.src;
    thumb.src=previous;
    const alt=main.alt;
    main.alt=thumb.alt;
    thumb.alt=alt;
  }
  function bindNotificationGestures(){
    let startX=0,startY=0,startTime=0,target=null;
    $('notificationsList')?.addEventListener('touchstart',event=>{const slot=event.target.closest('.notification-slot');if(!slot)return;target=slot;startX=event.changedTouches[0].clientX;startY=event.changedTouches[0].clientY;startTime=Date.now();},{passive:true});
    $('notificationsList')?.addEventListener('touchend',event=>{if(!target)return;const dx=event.changedTouches[0].clientX-startX;const dy=event.changedTouches[0].clientY-startY;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)&&Date.now()-startTime<1500)removeNotification(target.dataset.id);target=null;},{passive:true});
  }

  /* =========================================================
     FORM + MODAL HELPERS
  ========================================================== */
  function setToday(){if(!$('postDate').value)$('postDate').value=today();}
  function sanitizePhone(event){event.target.value=event.target.value.replace(/\D/g,'').slice(0,10);}
  function closeModal(id){$(id)?.classList.add('hidden');}
  function closeAllModals(){$$('.modal').forEach(x=>x.classList.add('hidden'));}
  function closeSidebar(){$('sidebar')?.classList.remove('open');document.body.classList.remove('sidebar-open');$$('[data-action="toggle-sidebar"]').forEach(button=>button.setAttribute('aria-expanded','false'));}
  function toast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(window.__roomHuntToast);window.__roomHuntToast=setTimeout(()=>node.classList.remove('show'),2800);}
})();
