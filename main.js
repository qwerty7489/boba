// Simple Boba Maker in Phaser 3
// Single-file game logic for the boba maker

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  // logical game resolution (kept as design reference)
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1000,
    height: 660
  },
  // make the Phaser canvas transparent so the HTML background image can show through
  transparent: true,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

let uiGroup;
let pageBackground = null;
let selectedSize = null;
let selectedFlavor = null;
let toppings = [];
let cupSprites = {};
let ordersContainer = null;
let shopContainer = null;
let activeOrder = null; // only one customer at a time
let customersEnabled = true; // when false no new customers will be created
let currentOrderInMaker = null; // the order currently loaded into the maker (if any)
let lastCustomerAppearanceId = null;
let money = 100000;
let moneyText = null;
let moneyHudContainer = null;
let globalActionsContainer = null;
let collectionPausedDialogue = false;
let moneyBg = null;
const moneyHudPadding = 10;
let dayNumber = 1;
let dayServedCount = 0;
let dayStartMoney = 0;
let dayText = null;
let dayContainer = null;
// villain dialogue controls: when set, the villain will speak these lines in the Orders bubble
let villainDialogue = null;
let villainDialogueIndex = 0;
let villainTalking = false;
// which avatar imageKey is the owner of the current villainDialogue (so we can cancel if customer changes)
let villainDialogueOwnerImageKey = null;
// track the story-key of the dialogue owner (e.g. 'PenelopeReturn') when a story sequence starts
let villainDialogueOwnerStoryKey = null;
// internal flag: set when we should unlock VDD when the current story dialogue finishes
let pendingUnlockVDDOnStoryEnd = false;
// vertical offset (px) to nudge the money HUD lower from the very top
// lower this value to move the HUD up if top UI elements were previously pushed down
const moneyHudOffsetY = 6;
let currentScreen = 'orders';
let receiptContainer = null;
let receiptExpanded = false;
// Coins: separate currency rewarded for special customers
let coins = (typeof window !== 'undefined' && typeof window._coins === 'number') ? window._coins : 0;
let coinText = null;
let coinBg = null;
let coinHudContainer = null;
// layout anchors for maker UI (populated in create()) so shop can append new buttons
let makerUIX = null;
let makerColLeft = null;
// vertical offset to nudge entire Maker UI down when elements are clipped
// set to 0 to keep Maker UI at its original vertical position
const makerYOffset = 0;
let makerColRight = null;
// owned lists control which items appear in the Maker UI (shop purchases add to these)
let ownedFlavors = [];
let ownedToppings = [];
// keys of collection entries the player has met (e.g. 'Penelope2', 'Elena2')
let collectedCharacters = {};

// Pet stats (0-100). Higher is better. These decay a little each day and persist on window for debug.
let petHunger = (typeof window !== 'undefined' && typeof window._pet_hunger === 'number') ? window._pet_hunger : 100;
let petBoredom = (typeof window !== 'undefined' && typeof window._pet_boredom === 'number') ? window._pet_boredom : 100;

// Mark a character as collected (imageKey like 'Fiona' -> coll key 'Fiona2')
function markCharacterCollected(imageKey) {
  try {
    if (!imageKey) return;
    const collKey = String(imageKey) + '2';
    if (!CUSTOMER_ASSET_MAP || !CUSTOMER_ASSET_MAP[collKey]) return;
    try { collectedCharacters[collKey] = true; } catch (e) {}
    // If the collection overlay is currently open, rebuild it so the newly-collected
    // picture appears immediately.
    try {
      const existing = document.getElementById('collectionOverlay');
      const wasVisible = existing && existing.style && existing.style.display && existing.style.display !== 'none';
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      // recreate the overlay DOM (createCollectionOverlay is idempotent)
      try { createCollectionOverlay(); } catch (e) {}
      if (wasVisible) {
        try { const el = document.getElementById('collectionOverlay'); if (el) el.style.display = 'flex'; } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
  // update OTHU visibility in Orders UI in case this collection completed the set
  try { if (typeof updateOTHUVisibility === 'function') updateOTHUVisibility(); } catch (e) {}
  try { if (typeof updateTVDUVisibility === 'function') updateTVDUVisibility(); } catch (e) {}
  try {
    // if Callisto was collected, mark the Callisto part complete for VDD unlock
    try {
      const key = imageKey ? String(imageKey) : '';
      if (key && (key === 'Callisto' || key === 'Callisto2' || key.toLowerCase() === 'callisto')) {
        vddCallistoCollected = true;
        try { ensureVddUnlockedIfReady(); } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
}

function ensureVddUnlockedIfReady() {
  try {
    if (!vddUnlocked && vddCallistoCollected && vddPenelopeReturnCompleted) {
      vddUnlocked = true;
      try { if (typeof updateVDDVisibility === 'function') updateVDDVisibility(); } catch (e) {}
    }
  } catch (e) {}
}
// Story characters: appear once every 3 days (alternating) and do not place orders
let storyCharacters = [
  {
    key: 'Fiona',
    imageKey: 'Fiona',
    dialogue: [
      { speaker: 'fiona', text: 'You the owner here? Cute setup. Feels like a place that means something. How rare.' },
      { speaker: 'you', text: 'Thanks? Welcome to Boba Dream, how can I help you?' },
      { speaker: 'fiona', text: 'Oh, I’m not here for tea. I came with a warning. Listen, this woman — Vera Chai — she’s trying to turn this neighborhood into her playground.' },
      { speaker: 'you', text: 'I met her, she owns BobaCorp, right?' },
      { speaker: 'fiona', text: 'Yeah. Thinks she’s the queen of flavor and the mayor of morality. She’s buying out every local shop and calling it “modernization.” My old diner? Gone. And now? She’s coming for you.' },
      { speaker: 'you', text: 'But I don’t want to close down…' },
      { speaker: 'fiona', text: 'Good answer. But she’ll take your recipes, your regulars, everything, until you have nothing left.' },
      { speaker: 'you', text: 'You sound like you’ve seen it firsthand.' },
      { speaker: 'fiona', text: 'I have. And I’m not watching another dream get swallowed. I have a contact inside BobaCorp — Penelope Eckhart. Archaeologist. They hired her to dig up some ancient tea recipe.' },
      { speaker: 'fiona', text: 'Apparently it’s not just tea. It’s something… weird. She said it “controls” people. I think she’s weaponizing it and making millions in the process.' },
      { speaker: 'you', text: 'Weaponizing tea?' },
      { speaker: 'fiona', text: 'You haven’t met Vera Chai. She’d sell people their own childhoods if she could bottle it.' },
      { speaker: 'you', text: 'So what should I do?' },
      { speaker: 'fiona', text: 'Talk to Penelope before Vera silences her. She works in the BobaCorp lab downtown, I\'ll send her a message.' },
      { speaker: 'you', text: 'And when I do?' },
      { speaker: 'fiona', text: 'Then maybe you can actually fight back. I have people — my family. You’ll want them on your side. But first, you need to talk to her.' },
      { speaker: 'you', text: 'Why are you helping me?' },
      { speaker: 'fiona', text: 'Because you remind me of myself.' }
    ]
  },
  {
    key: 'Penelope',
    imageKey: 'Penelope',
    dialogue: [
      { speaker: 'you', text: 'Penelope Eckhart?' },
      { speaker: 'penelope', text: 'Please... keep your voice down.' },
      { speaker: 'you', text: 'Fiona Gallagher said you found something you shouldn\'t have.' },
      { speaker: 'penelope', text: 'I guess I can tell you since Fiona wants to help you. Yes, I found something. But it wasn\'t a recipe. It was a ritual—buried beneath layers of tradition and sugar and marketing.' },
      { speaker: 'you', text: 'A ritual?' },
      { speaker: 'penelope', text: 'Long before it became trendy, bubble tea had a different purpose. It was brewed as part of a ceremony—one meant to quiet the mind entirely. Not for peace, but for control. The ingredients created a blankness that made people... suggestible.' },
      { speaker: 'penelope', text: 'The original method was lost over time, but Vera has managed to come frighteningly close. She found a supplier—someone willing to provide her with a substance that could replicate the effect.' },
      { speaker: 'you', text: 'What kind of substance?' },
      { speaker: 'penelope', text: 'I wish I knew. I\'ve only seen fragments—shadows of the truth. But what I have seen... it\'s enough.' },
      { speaker: 'penelope', text: 'The people who drink it don\'t feel poisoned. They feel calm, but that\'s when they begin to lose themselves. Their memories blur and their wills slip away from them.' },
      { speaker: 'you', text: 'How could she sell that to people?' },
      { speaker: 'penelope', text: 'She only cares about profit. She calls it “Soulbinding Tea.” She promises it\'ll bring happiness—make people whole. But the truth is far darker. Drinking it doesn\'t just soothe; it dulls the mind until they\'re nothing more than puppets, ready to bend to her will.' },
      { speaker: 'you', text: 'You can\'t just let her—' },
      { speaker: 'penelope', text: 'Do you think I want to? She owns the lab. She owns everything there—including me. I can\'t just walk away. Not without risking everything.' },
  { speaker: 'penelope', text: 'I have to go. If I stay even a moment longer, it won\'t end well for me.', hideDomAfter: true },
  { speaker: 'you', text: 'Wait! I didn\'t even get to ask how we could stop her…' }
    ]
  }
];
// Helper: decide whether an appearance imageKey is a 'special' customer
function isSpecialAppearance(imageKey) {
  try {
    if (!imageKey) return false;
    const specials = ['Lucas','Nathan','Haley','Peyton','Brooke','Callisto','Stefan','Damon','Elena','Caroline','Bonnie'];
    return specials.includes(String(imageKey));
  } catch (e) { return false; }
}

// Show the OTHU image in the Orders UI when the player has collected all OTH special characters
function updateOTHUVisibility() {
  try {
    if (!ordersContainer) return;
    const othKeys = ['Lucas','Nathan','Haley','Peyton','Brooke'];
    // collected key format uses 'Name2'
    const allCollected = othKeys.every(k => !!collectedCharacters[k + '2']);
    try {
      if (ordersContainer.othuImage) {
        try { if (!window._orders_othu_shown && allCollected && currentScreen === 'orders') window._orders_othu_shown = true; } catch (e) {}
        const show = (currentScreen === 'orders') && (!!allCollected || !!window._orders_othu_shown);
        ordersContainer.othuImage.setVisible(show);
        try { if (ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(show); } catch (e) {}
      }
      // if a DOM fallback exists, toggle its display and reposition
      try {
        const d = ordersContainer._othuDom;
        if (d) {
          if (currentScreen === 'orders' && (allCollected || !!window._orders_othu_shown)) {
            try { d.style.display = 'block'; } catch (e) {}
            // attempt to reposition using stored helper
            try {
              const canvas = (window && window.game && window.game.canvas) ? window.game.canvas : (scene && scene.sys && scene.sys.game && scene.sys.game.canvas) ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
              const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
              const scaleX = canvas ? (canvas.clientWidth / (scene.sys.game.config.width || canvas.width || 1)) : 1;
              const scaleY = canvas ? (canvas.clientHeight / (scene.sys.game.config.height || canvas.height || 1)) : 1;
              const worldX = (ordersContainer.x || 0) + (ordersContainer._othuDomPos.x || 0);
              const worldY = (ordersContainer.y || 0) + (ordersContainer._othuDomPos.y || 0);
              const left = Math.round(rect.left + worldX * scaleX);
              const top = Math.round(rect.top + worldY * scaleY);
              d.style.left = left + 'px';
              d.style.top = top + 'px';
              d.style.width = Math.round((ordersContainer._othuDomPos.w || 72) * scaleX) + 'px';
              d.style.height = Math.round((ordersContainer._othuDomPos.h || 72) * scaleY) + 'px';
            } catch (e) {}
          } else {
            try { d.style.display = 'none'; } catch (e) {}
          }
        }
      } catch (e) {}
    } catch (e) {}
  } catch (e) {}
}
// Show the TVDU image in the Orders UI when the player has collected all TVD special characters
function updateTVDUVisibility() {
  try {
    if (!ordersContainer) return;
    const tvdKeys = ['Stefan','Damon','Elena','Caroline','Bonnie'];
    const allCollected = tvdKeys.every(k => !!collectedCharacters[k + '2']);
    try {
        if (ordersContainer.tvduImage) {
        // once TVDU has been shown in Orders, keep it visible for Orders sessions
        try { if (!window._orders_tvdu_shown && allCollected && currentScreen === 'orders') window._orders_tvdu_shown = true; } catch (e) {}
        const showT = (currentScreen === 'orders') && (!!allCollected || !!window._orders_tvdu_shown);
        ordersContainer.tvduImage.setVisible(showT);
        try { if (ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(showT); } catch (e) {}
      }
      try {
        const d = ordersContainer._tvduDom;
        if (d) {
          // show DOM TVDU when in Orders and either collection is complete or TVDU was previously shown
          if (currentScreen === 'orders' && (allCollected || !!window._orders_tvdu_shown)) {
            try { d.style.display = 'block'; } catch (e) {}
            try {
              const canvas = (window && window.game && window.game.canvas) ? window.game.canvas : document.querySelector('#game-container canvas');
              const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
              const scaleX = canvas ? (canvas.clientWidth / (window.game && window.game.config && window.game.config.width || rect.width || 1)) : 1;
              const scaleY = canvas ? (canvas.clientHeight / (window.game && window.game.config && window.game.config.height || rect.height || 1)) : 1;
              const worldX = (ordersContainer.x || 0) + (ordersContainer._tvduDomPos.x || 0);
              const worldY = (ordersContainer.y || 0) + (ordersContainer._tvduDomPos.y || 0);
              const left = Math.round(rect.left + worldX * scaleX);
              const top = Math.round(rect.top + worldY * scaleY);
              d.style.left = left + 'px';
              d.style.top = top + 'px';
              d.style.width = Math.round((ordersContainer._tvduDomPos.w || 72) * scaleX) + 'px';
              d.style.height = Math.round((ordersContainer._tvduDomPos.h || 72) * scaleY) + 'px';
            } catch (e) {}
          } else {
            try { d.style.display = 'none'; } catch (e) {}
          }
        }
      } catch (e) {}
    } catch (e) {}
  } catch (e) {}
}
// Show the VDD image in the Orders UI when unlocked (Callisto served or PenelopeReturn finished)
function updateVDDVisibility() {
  try {
    if (!ordersContainer) return;
  try { if (!window._orders_vdd_shown && vddUnlocked && currentScreen === 'orders') window._orders_vdd_shown = true; } catch (e) {}
  const showV = (currentScreen === 'orders') && (!!vddUnlocked || !!window._orders_vdd_shown);
  try { if (ordersContainer.vddImage) ordersContainer.vddImage.setVisible(showV); } catch (e) {}
  try { if (ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(showV); } catch (e) {}
    try {
      const d = ordersContainer._vddDom;
        if (d) {
        if (showV) {
          try { d.style.display = 'block'; } catch (e) {}
          try {
            const canvas = (window && window.game && window.game.canvas) ? window.game.canvas : document.querySelector('#game-container canvas');
            const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
            const scaleX = canvas ? (canvas.clientWidth / (window.game && window.game.config && window.game.config.width || rect.width || 1)) : 1;
            const scaleY = canvas ? (canvas.clientHeight / (window.game && window.game.config && window.game.config.height || rect.height || 1)) : 1;
            const worldX = (ordersContainer.x || 0) + (ordersContainer._vddDomPos.x || 0);
            const worldY = (ordersContainer.y || 0) + (ordersContainer._vddDomPos.y || 0);
            const left = Math.round(rect.left + worldX * scaleX);
            const top = Math.round(rect.top + worldY * scaleY);
            d.style.left = left + 'px';
            d.style.top = top + 'px';
            d.style.width = Math.round((ordersContainer._vddDomPos.w || 72) * scaleX) + 'px';
            d.style.height = Math.round((ordersContainer._vddDomPos.h || 72) * scaleY) + 'px';
          } catch (e) {}
        } else {
          try { d.style.display = 'none'; } catch (e) {}
        }
      }
    } catch (e) {}
  } catch (e) {}
}
// Ensure badge wrappers/images are hidden when not on Orders, and update when on Orders
function ensureOrdersBadgesVisibility() {
  try {
    if (typeof currentScreen === 'undefined' || currentScreen !== 'orders') {
      try { if (ordersContainer && ordersContainer.othuImage) ordersContainer.othuImage.setVisible(false); } catch (e) {}
      try { if (ordersContainer && ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(false); } catch (e) {}
      try { const od = ordersContainer && ordersContainer._othuDom; if (od) od.style.display = 'none'; } catch (e) {}
      try { if (ordersContainer && ordersContainer.tvduImage) ordersContainer.tvduImage.setVisible(false); } catch (e) {}
      try { if (ordersContainer && ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(false); } catch (e) {}
      try { const td = ordersContainer && ordersContainer._tvduDom; if (td) td.style.display = 'none'; } catch (e) {}
      try { if (ordersContainer && ordersContainer.vddImage) ordersContainer.vddImage.setVisible(false); } catch (e) {}
      try { if (ordersContainer && ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(false); } catch (e) {}
      try { const vd = ordersContainer && ordersContainer._vddDom; if (vd) vd.style.display = 'none'; } catch (e) {}
    } else {
      try { updateOTHUVisibility(); } catch (e) {}
      try { updateTVDUVisibility(); } catch (e) {}
      try { updateVDDVisibility(); } catch (e) {}
    }
  } catch (e) {}
}
// Add Philip story character (appears day 9)
storyCharacters.push({
  key: 'Philip',
  imageKey: 'Philip',
  dialogue: [
    { speaker: 'philip', text: 'Hey, I\'m Philip Gallagher. You\'re the one Fiona wants me to help, right?' },
    { speaker: 'you', text: 'Yeah. What\'s going on?' },
    { speaker: 'philip', text: 'I\'ve been looking after some kids. Their parents drank Vera\'s tea. They\'re… not themselves anymore.' },
    { speaker: 'you', text: 'How bad is it?' },
    { speaker: 'philip', text: 'Some don\'t even remember their own kids. Just constantly asking for more tea. It\'s worse than anything I expected.' },
    { speaker: 'you', text: 'That\'s awful.' },
    { speaker: 'philip', text: 'It is. My friends V and Kev help with meals and check on the neighbors. I mostly just make sure the kids don\'t get hurt while their parents are… gone in their heads.' },
    { speaker: 'you', text: 'How are the kids handling it?' },
    { speaker: 'philip', text: 'At first they were scared out of their minds and some were crying for hours. But they\'re starting to come around. Kev keeps snacks coming, and V keeps spirits up. It\'s not glamorous, but it\'s working.' },
    { speaker: 'you', text: 'That\'s great.' },
    { speaker: 'philip', text: 'It\'s not enough, though. Watching what Vera\'s tea does and seeing the way it changes people… it proves how dangerous she really is.' },
    { speaker: 'you', text: 'So what can we do?' },
    { speaker: 'philip', text: 'I\'ve been tracking when the batches arrive and all the delivery routes. I\'m getting better at guessing her next moves and if I can predict her next drop, we might finally have an edge. But after I do, we can\'t just sit around and watch. We have to move.' },
    { speaker: 'you', text: 'Alright. What\'s the plan?' },
    { speaker: 'philip', text: 'I\'ll let my siblings Debs and Ian know so we can start working on a plan to stop her. I\'ll make sure to keep you posted.' },
    { speaker: 'you', text: 'Stay safe out there.' },
    { speaker: 'philip', text: 'Will do.' }
  ]
});
// Add Villain (Vera Chai) — appears day 30
storyCharacters.push({
  key: 'Villain',
  imageKey: 'villain',
  dialogue: [
  { speaker: 'you', text: 'Who\'s there?' },
  { speaker: 'vera', text: 'You really think you\'re safe in your little shop? I\'ve been watching. I know everything you\'ve done.' },
  { speaker: 'you', text: 'Vera Chai...?' },
  { speaker: 'vera', text: 'I have Penelope\'s cure, I stole it while she was on one of her little excavations. I\'m going to destroy it and your pathetic shop. You\'re nothing but a little pest getting in my way.' },
  { speaker: 'you', text: 'Vera, it doesn\'t have to end like this.' },
  { speaker: 'vera', text: 'What do you know about how it\'s going to end!' },
  { speaker: 'you', text: 'Vera… I know what happened to your brother and I\'m sorry.' },
  { speaker: 'vera', text: 'That fool Gray! Your little sorry won\'t bring him back! That day broke me. Nobody cared. Nobody ever cares.' },
  { speaker: 'you', text: 'I know that you\'re suffering, but hurting others won\'t bring him back.' },
  { speaker: 'vera', text: 'You think I\'m hurting people? I\'m teaching them to see me, to finally care! Compellus makes them notice, makes them obedient… makes them see.' },
  { speaker: 'you', text: 'That\'s not teaching. That\'s control.' },
  { speaker: 'vera', text: 'Control is all I have left! Everyone laughed at me when I cried. I\'ll never be ignored again!' },
  { speaker: 'you', text: 'It\'s not too late. You can stop, Vera. Let go.' },
  { speaker: 'vera', text: 'Let go? After all this? After everything I\'ve built? There\'s millions to make, and power to gain… I won\'t give it up!' },
  { speaker: 'you', text: 'You can. Think about all the people who would get hurt if you kept going like this! Vera, you aren\'t alone.' },
  { speaker: 'vera', text: 'Not alone? You think anyone could ever understand? You don\'t know what it\'s like to lose someone and be invisible to the world... to watch them die and feel helpless.' },
  { speaker: 'you', text: 'There\'s another way, Vera. You don\'t have to destroy the cure.' },
  { speaker: 'vera', text: 'Oh, I do. This ends tonight. No more weakness. No more mistakes---Wait, little boy!', showVideo: 'Movie.mp4' }
  ,
  { speaker: 'you', text: 'You did the right thing, saving him.' },
  { speaker: 'vera', text: 'I… I can\'t… not again…' },
  { speaker: 'you', text: 'You made the right choice. The cure is safe, and everyone else will be too.' },
  { speaker: 'vera', text: 'Maybe… maybe I need to take a break…' },
  { speaker: 'you', text: 'You can. It\'s over. The Compellus shouldn\'t be used to hurt anyone.' },
  { speaker: 'vera', text: '…I understand. This ends here.' },
  { speaker: 'you', text: 'Everyone\'s safe now. It\'s finally over.', showVideo: 'Better.mp4', }
  ]
});
// Add Ian story character (appears day 12)
storyCharacters.push({
  key: 'Ian',
  imageKey: 'Ian',
  dialogue: [
    { speaker: 'ian', text: 'So… you\'re the one Lip told me about? The shop owner who\'s standing up to Vera Chai?' },
    { speaker: 'you', text: 'That\'s me. Are you Ian Gallagher?' },
    { speaker: 'ian', text: 'Yeah. I was an EMT, until recently. But last week... something happened that I can\'t unsee.' },
    { speaker: 'you', text: 'What happened?' },
    { speaker: 'ian', text: 'We got called out to help a woman who wasn\'t responding. Her vitals were unstable, her pupils dilated — it looked like a standard overdose. But when we arrived, she was just smiling in this eerie, empty kind of way. She kept whispering, over and over, about her “happy place.”' },
    { speaker: 'you', text: 'Was she one of Vera\'s customers?' },
    { speaker: 'ian', text: 'Yeah. The cup was even still in her hand. It smelled like honey and jasmine at first, but underneath that was something cold, and almost… synthetic.' },
    { speaker: 'you', text: 'Oh my gosh.. so what did you do?' },
    { speaker: 'ian', text: 'I did what I was trained to do — started chest compressions, tried to revive her. But she didn\'t respond at all. No tension, no pain reflex, not even a flinch. She just kept whispering, “I see her… I see Vera.” Then her heart stopped.' },
    { speaker: 'ian', text: 'But that\'s not the worst part. A minute later, she sat up. Her eyes were completely empty, and her pulse was gone. But she still looked straight at me and said, “Would you like a sample?”' },
    { speaker: 'you', text: 'No way…' },
    { speaker: 'ian', text: 'I wish I was joking. The next morning, BobaCorp sent out a statement calling it a "freak allergic reaction." They covered up every trace of her record.' },
    { speaker: 'you', text: 'So this isn\'t just about controlling people. It\'s worse.' },
    { speaker: 'ian', text: 'Whatever that poison that Penelope mentioned is, it\'s manipulating minds and rewriting people. Vera\'s trying to turn them into walking advertisements for her empire.' },
    { speaker: 'you', text: 'And you saw it firsthand.' },
    { speaker: 'ian', text: 'I\'ve tried running, but I just can\'t forget it. My husband Mickey told me to stop running from the hard stuff — to fight for something real. So here I am.' },
    { speaker: 'you', text: 'Thanks, Ian. I know that must\'ve been hard to talk about.' },
    { speaker: 'ian', text: 'Yeah, but someone like you who cares enough to stop her should know. You\'re doing what the rest of us couldn\'t.' },
    { speaker: 'you', text: 'I\'ll need all the help I can get.' },
    { speaker: 'ian', text: 'You\'ve got it. I\'ll start checking with the hospitals to see if there are more victims. And I\'ll get Mickey on standby. If Vera\'s experimenting on people… we\'ll find proof.' },
    { speaker: 'you', text: 'Good. Because once we expose the truth, she won\'t be able to hide behind her brand anymore.' },
    { speaker: 'ian', text: 'Then let\'s do it. For that woman… and everyone else that fell for her lies.' }
  ]
});
// Add Debbie story character (appears day 15)
storyCharacters.push({
  key: 'Debbie',
  imageKey: 'Debbie',
  dialogue: [
    { speaker: 'debbie', text: 'Oh, so you\'re the one Ian keeps mentioning. Lovely little shop — smells like sugar and a tiny bit of trouble.' },
    { speaker: 'you', text: 'That\'s one way to put it. You\'re Debbie, right?' },
    { speaker: 'debbie', text: 'Debbie in the flesh. Seamstress, welder, shop-owner — and I\'ve got a respectable amount of business scars to show for it.' },
    { speaker: 'you', text: 'Meaning?' },
    { speaker: 'debbie', text: 'Meaning I just pulled a move that would make BobaCorp spit out their tapioca. All in a day\'s work.' },
    { speaker: 'you', text: 'I\'m listening.' },
    { speaker: 'debbie', text: 'Okay, so — you know Vera Chai\'s new “exclusive” clothing collab, right? The Sereni-Tea Collection? Supposedly infused with the “essence of inner peace.” Well we all know that it\'s really that poison Penelope was talking about. Well I have a plan.' },
    { speaker: 'you', text: 'So what\'d you do?' },
    { speaker: 'debbie', text: 'Simple. I built a fake version of the entire clothing line. Knockoff website, influencer buzz, fake “preorders.” Then I flooded the market with my versions — same style, better fabric, zero poison.' },
    { speaker: 'you', text: 'You scammed BobaCorp with fashion?' },
    { speaker: 'debbie', text: 'Correction — I out-hustled BobaCorp. They even thought my fake listings were legit. Every sale I make pulls buyers away from them.' },
    { speaker: 'you', text: 'That\'s… actually genius.' },
    { speaker: 'debbie', text: 'Oh, it gets better. Each outfit I sold came with a “free drink coupon” — redeemable only here. That\'s how your line outside tripled overnight.' },
    { speaker: 'you', text: 'You\'re the reason we\'ve been so busy?' },
    { speaker: 'debbie', text: 'You\'re welcome. Consider me your unofficial PR and hospitality department.' },
    { speaker: 'you', text: 'Deal!' },
    { speaker: 'debbie', text: 'Perfect. Now, if you\'ll excuse me, I\'ve got one more shipment to send out to get this full to the brim with customers.' }
  ]
});
// Add Carl story character (appears day 18)
storyCharacters.push({
  key: 'Carl',
  imageKey: 'Carl',
  dialogue: [
  { speaker: 'carl', text: 'Name\'s Carl. You got a sec? Gotta warn you bout what I saw.' },
  { speaker: 'you', text: ' Sure, but what happened? You don\'t look so great.' },
  { speaker: 'carl', text: 'Guess ya\' could say that.' },
  { speaker: 'carl', text: 'I\'m going about my job as a cop, and all\'s of a sudden I get this call about a complaint over a homeless guy on 8th and Maple. When I get there, I see this old guy, Mr. Hanes. He been running his little tea stand for a few years.' },
  { speaker: 'carl', text: 'He looked broken. Saw \'em sittin\' in the middle of the street with a bunch o\' random stuff lyin\' around — a kettle, broken jars, and tea leaves everywhere. \u2018cept his stand was gone. Nothin\' left. \'pparently BobaCorp sent in a crew overnight, tore it down while he slept. Said he didn\'t pay his "corporate compliance fee."' },
  { speaker: 'you', text: ' That\'s— that\'s horrible.' },
  { speaker: 'carl', text: 'He didn\'t even resist. Just asked if I could arrest \u2018em… Said if he was in jail, at least he\'d have somewhere to be.' },
  { speaker: 'you', text: ' Oh my god…' },
  { speaker: 'carl', text: 'I didn\'t know what to say. Bought \u2018em breakfast. Sat with \u2018em til he stopped shaking.' },
  { speaker: 'carl', text: 'Then I checked the records. Turns out, Vera been usin\' city inspectors to push out small shops that don\' wanna sell her ingredients. She\'s bribin\' \u2018em, falsifyin\' reports, forcin\' people into debt, and when they can\'t pay… buyin\' up their land.' },
  { speaker: 'you', text: ' So that\'s what this really is. It\'s a takeover.' },
  { speaker: 'carl', text: 'Yup. And the police? Half the department\'s on \u2018er payroll.' },
  { speaker: 'carl', text: 'I filed a report to HQ — the kind you don\'t submit through the system. But if she finds out I did it… I\'m done.' },
  { speaker: 'you', text: ' Carl… you didn\'t have to put yourself at risk.' },
  { speaker: 'carl', text: 'Someone had ta\'. Mr. Hanes looked at me and said, "You wear that badge to protect people, not to protect money." Guess he\'s right. I used ta\' think bein\' a cop was about rules. But it ain\'t. It\'s about people like \u2018em.' },
  { speaker: 'you', text: ' You did the right thing.' },
  { speaker: 'carl', text: 'I hope so. But that lady ain\'t slowing down. She\'s buildin\' somethin\' big and if she pushes it across the city, it\'s over. Everyone\'ll be hooked — and she\'ll own \u2018em.' },
  { speaker: 'you', text: ' Then we have to stop her.' },
  { speaker: 'carl', text: 'Yeah. Ma brother Liam\'s waitin\' for you, by the way. He\'s been diggin\' into the tea\'s chemistry. Says he found somethin\' that could change everythin\'.' },
  { speaker: 'you', text: ' Alright. Thanks Carl, for telling me. I hope Mr. Hanes feels better soon.' },
  { speaker: 'carl', text: 'Anytime. Just promise me somethin\' — when it\'s all over… make sure the little guys like Mr. Hanes get their place back.' },
  { speaker: 'you', text: ' I will.' },
  { speaker: 'carl', text: 'Good. Then maybe this city\'s still got a chance.' }
  ]
});
// Add Carl second story (appears day 33)
storyCharacters.push({
  key: 'Carl2',
  imageKey: 'Carl',
  dialogue: [
    { speaker: 'carl', text: 'Hey again, was out on patrol and found this lil stray wanderin\' \'round near the shop. Poor thin\' looked lost and hungry, figured ya’d know how ta\' take care of it. Whaddya say — wanna give \'em a home?' },
    { speaker: 'you', text: 'Oh my gosh, of course! I\'ll make sure to take care of it.' },
    { speaker: 'carl', text: 'Thanks, glad we have a new friend to liven up this ol\' shop of yers.' }
  ]
});
// Add Liam story character (appears day 21)
storyCharacters.push({
  key: 'Liam',
  imageKey: 'Liam',
  dialogue: [
  { speaker: 'liam', text: 'Hey, I\'m Liam.' },
  { speaker: 'you', text: ' You\'re Liam? Aren\'t you just a little kid? What\'s going on?' },
  { speaker: 'liam', text: 'I\'m not just a kid. I\'m the kid who found out the full extent of what Vera\'s been doing. And it\'s really bad.' },
  { speaker: 'you', text: ' Bad? How?' },
  { speaker: 'liam', text: 'It\'s poison. Vera uses a poison called Compellus in her Soulbinding Tea. It doesn\'t just make people loyal, it rewires their minds. Turns them into living puppets. And the thing is, it\'s subtle. People will still smile and think it\'s their own choice, but everything they do is controlled by her.' },
  { speaker: 'you', text: ' That\'s… terrifying. I\'m not sure how to stop her, but I\'ll try.' },
  { speaker: 'liam', text: 'Everyone who\'ve visited will back you up, so don\'t worry and just focus on doing what you can to stop Vera.' },
  { speaker: 'you', text: 'Got it, you\'re pretty impressive, you know that? Thanks for your help.' },
  { speaker: 'liam', text: 'Anytime.' }
  ]
});
// Penelope returns with new dialogue (appears day 24 via PenelopeReturn)
storyCharacters.push({
  key: 'PenelopeReturn',
  imageKey: 'Penelope',
  dialogue: [
    { speaker: 'you', text: ' Penelope? You\'ve been gone all week, what happened?' },
    { speaker: 'penelope', text: ' You\'re not going to believe what I found.' },
    { speaker: 'you', text: ' You sound like someone who dug up trouble.' },
    { speaker: 'penelope', text: ' Not trouble. A cure.' },
    { speaker: 'you', text: ' A cure?' },
    { speaker: 'penelope', text: ' For the Compellus toxin. The very one BobaCorp\'s been slipping into the tea to keep people craving more. I didn\'t make it… I found it.' },
    { speaker: 'you', text: ' What? Where did you find it?' },
    { speaker: 'penelope', text: ' Outside the city, there\'s an old tea site and it\'s one of the first tea cultivation ruins. It seems that they used to grow pure natural tea leaves. I dug around and uncovered these sealed clay jars that have to be centuries old, but they were still intact. Inside they held some sort of liquid essence.' },
    { speaker: 'you', text: ' You\'re kidding.' },
    { speaker: 'penelope', text: ' I thought it was ceremonial at first, but when I tested the residue… it counteracted the Compellus instantly. Those early brewers must have created a natural immunity for it.' },
    { speaker: 'you', text: ' Penelope… that\'s unbelievable. How long before it\'s ready?' },
    { speaker: 'penelope', text: ' Not long. I just came to tell you — it\'s real, it\'s working, and soon you\'ll have it. I\'m heading back now to finish testing and extract the last of the essence before time or weather ruins it.' },
    { speaker: 'you', text: ' Please be careful. Who knows what Vera Chai could do to you if she finds out—' },
    { speaker: 'penelope', text: ' I know. But I promise you\'ll have the cure in no time. Then we can save this town and everyone that\'s been affected.' }
  ]
});
// Add Gray story character (appears day 27)
storyCharacters.push({
  key: 'Gray',
  imageKey: 'Gray',
  dialogue: [
  { speaker: 'gray', text: ' Hello?' },
  { speaker: 'you', text: 'Hi, how can I help you?' },
  { speaker: 'gray', text: 'My name\'s Gray. I know you\'ve been investigating Vera, and I agree with you that she\'s gone too far. But she has a reason, believe me.' },
  { speaker: 'you', text: 'A reason?' },
  { speaker: 'gray', text: 'Vera\'s little brother, Milo… he was sick. She begged for any kind of help to pay for his medication. Hospitals, neighbors, anyone — she reached out for someone, anyone, to save him. And nobody came.' },
  { speaker: 'gray', text: 'She tried everything… she even tried to sell her own homemade boba teas — her brother\'s favorite drink. Having boba would always make him happy, so she thought it would have the same effect on other people. But no one even spared a glance to buy one. Her brother died in her arms, and she couldn\'t do anything to save him.' },
  { speaker: 'gray', text: 'That\'s when she started experimenting and researching to recreate the ancient Compellus from the past. At first, it was to make her boba teas taste so great that everyone would want to buy one.  But it got worse. The Compellus she made could change people, and her grief… her anger… it warped her. She started wanting control over everyone so she could never feel helpless again.' },
  { speaker: 'you', text: 'So all this… the Soulbinding Tea… it\'s her way of fixing the pain she suffered from in the past?' },
  { speaker: 'gray', text: 'Yes, but it\'s really poison. I\'m worried about her because she doesn\'t realize that this is seriously harming people in ways that they can never recover from.' },
  { speaker: 'you', text: 'Penelope\'s made a cure. It\'s not perfect yet, but I think it\'ll be able to break the Compellus\'s hold. Some people were tested… and they woke up like they were breathing for the first time.' },
  { speaker: 'gray', text: 'But the second Vera finds out, she\'s going to come for you. She knows what you\'ve been doing behind her back. And when she comes she won\'t hold back.' },
  { speaker: 'you', text: 'We\'ll be ready for her.' },
  { speaker: 'gray', text: 'Then I wish you luck.' }
  ]
});
let lastStoryShownDay = 0;
let lastSpecialShownDay = 0;
// scrollable maker content containers (populated in create)
let makerFlavorsContent = null;
let makerToppingsContent = null;

// DOM customer image tuning (scale multiplier and pixel offsets)
const domCustomerScaleMultiplier = 6.5; // 1.0 = base 64px, >1 to enlarge
const domCustomerOffsetX = 100; // extra pixels to nudge right
const domCustomerOffsetY = 0;  // extra pixels to nudge down

// Map of texture keys -> exact asset filenames in /assets
const CUSTOMER_ASSET_MAP = {
  customer1: 'Customer__1-removebg-preview.png',
  customer1_raw: 'Customer__1-removebg-preview.png',
  customer2: 'Customer2-removebg-preview.png',
  customer2_raw: 'Customer2-removebg-preview.png',
  customer3: 'Customer3-removebg-preview.png',
  customer3_raw: 'Customer3-removebg-preview.png',
  customer4: 'Customer4-removebg-preview.png',
  customer4_raw: 'Customer4-removebg-preview.png',
  customer5: 'Customer5-removebg-preview.png',
  customer5_raw: 'Customer5-removebg-preview.png',
  customer6: '6-removebg-preview.png',
  customer6_raw: '6-removebg-preview.png',
  customer7: 'C7-removebg-preview.png',
  customer7_raw: 'C7-removebg-preview.png',
  customer8: 'C8-removebg-preview.png',
  customer8_raw: 'C8-removebg-preview.png',
  customer9: 'C9-removebg-preview.png',
  customer9_raw: 'C9-removebg-preview.png',
  customer10: 'C10-removebg-preview.png',
  customer10_raw: 'C10-removebg-preview.png'
};

// special villain customer asset
CUSTOMER_ASSET_MAP.villain = 'Villain1.png';
  // story character assets
  CUSTOMER_ASSET_MAP.Fiona = 'Fiona.png';
  CUSTOMER_ASSET_MAP.Penelope = 'Penelope1.png';
  CUSTOMER_ASSET_MAP.Philip = 'Philip.png';
  CUSTOMER_ASSET_MAP.Ian = 'Ia1.png';
  CUSTOMER_ASSET_MAP.Debbie = 'Debbie.png';
  CUSTOMER_ASSET_MAP.Carl = 'Carl.png';
  CUSTOMER_ASSET_MAP.Liam = 'Liam.png';
  CUSTOMER_ASSET_MAP.Gray = 'Gray.png';
  // special character assets
    CUSTOMER_ASSET_MAP.Lucas = 'Luc.png';
    CUSTOMER_ASSET_MAP.Caroline = 'Carol.png';
    CUSTOMER_ASSET_MAP.Damon = 'Damon1.png';
    CUSTOMER_ASSET_MAP.Elena = 'Elena.png';
    CUSTOMER_ASSET_MAP.Stefan = 'St.png';
    CUSTOMER_ASSET_MAP.Peyton = 'peyt.png';
    CUSTOMER_ASSET_MAP.Bonnie = 'Bonnie.png';
    CUSTOMER_ASSET_MAP.Brooke = 'Brooke.png';
    CUSTOMER_ASSET_MAP.Haley = 'Halez.png';
    CUSTOMER_ASSET_MAP.Nathan = 'Nath.png';
    CUSTOMER_ASSET_MAP.Callisto = 'Callisto.png';
  // collection character assets
    CUSTOMER_ASSET_MAP.Lucas2 = 'Lucas2.png';
    CUSTOMER_ASSET_MAP.Caroline2 = 'Caroline2.png';
    CUSTOMER_ASSET_MAP.Damon2 = 'Damon2.png';
    CUSTOMER_ASSET_MAP.Elena2 = 'Elena2.png';
    CUSTOMER_ASSET_MAP.Stefan2 = 'Stefan2.png';
    CUSTOMER_ASSET_MAP.Peyton2 = 'Peyton2.png';
    CUSTOMER_ASSET_MAP.Bonnie2 = 'Bonnie2.png';   
    CUSTOMER_ASSET_MAP.Brooke2 = 'Brooke2.png';
    CUSTOMER_ASSET_MAP.Haley2 = 'Haley2.png';
    CUSTOMER_ASSET_MAP.Nathan2 = 'Nathan2.png';
    CUSTOMER_ASSET_MAP.Callisto2 = 'Callisto2.png';
    // story collection character assets
    CUSTOMER_ASSET_MAP.Penelope2 = 'Penel.png';
    CUSTOMER_ASSET_MAP.Fiona2 = 'Fiona2.png';
    CUSTOMER_ASSET_MAP.Philip2 = 'Philip2.png';
    CUSTOMER_ASSET_MAP.Ian2 = 'Ian2.png';
    CUSTOMER_ASSET_MAP.Debbie2 = 'Debbie2.png';
    CUSTOMER_ASSET_MAP.Carl2 = 'Carl2.png';
    CUSTOMER_ASSET_MAP.Liam2 = 'Liam2.png';
// Orders panel dimensions (adjust to make the orders UI skinnier)
const ORDERS_PANEL_W = 440;
const ORDERS_PANEL_H = 480;

// Reusable styled button: top-left x,y, width w, height h
function styledButton(scene, x, y, w, h, color, label, onClick) {
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();
  // base
  g.fillStyle(color, 1);
  g.fillRoundedRect(0, 0, w, h, 8);
  g.lineStyle(2, 0x7a6f6f, 1);
  g.strokeRoundedRect(0, 0, w, h, 8);
  // highlight
  const shine = scene.add.graphics();
  shine.fillStyle(0xffffff, 0.12);
  shine.fillRoundedRect(6, 6, w - 12, Math.max(8, Math.floor(h * 0.45)), 6);
  container.add(g);
  container.add(shine);
  const txt = scene.add.text(0, 0, label, { font: 'bold 14px Poppins', fill: '#fff' });
  txt.x = Math.floor((w - txt.width) / 2);
  txt.y = Math.floor((h - txt.height) / 2);
  container.add(txt);
  container.setSize(w, h);
  // create a dedicated (invisible) hit zone so input aligns with the button visuals
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0);
  container.add(hit);
  hit.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains, true);
  hit.input.cursor = 'pointer';
  // small press animation and then call the onClick callback (triggered from the zone)
  hit.on('pointerdown', (p) => {
    const pressDistance = 3;
    const pressScale = 0.98;
    scene.tweens.killTweensOf(container);
    const baseY = container.y;
    const baseScale = container.scale || 1;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 90,
      ease: 'Quad.easeOut',
      yoyo: true,
      onUpdate: (t) => {
        const v = t.getValue();
        container.y = baseY + v * pressDistance;
        container.scale = baseScale - v * (baseScale - pressScale);
      },
      onComplete: () => {
        container.y = baseY;
        container.scale = baseScale;
      }
    });
    if (onClick) onClick(p);
  });
  return container;
}

// Game-wide flag to track if the Pet screen has been unlocked (Carl2 dialogue on day 33)
let petUnlocked = false;
// whether VDD badge/asset has been unlocked/shown
let vddUnlocked = false;
// track partial unlock state: Callisto served and PenelopeReturn completed
let vddCallistoCollected = false;
let vddPenelopeReturnCompleted = false;


function preload() {
  // Preload customer avatar so it can be displayed in the Orders UI.
  // Use the URL-encoded filename to avoid issues with spaces/special chars when served.
  // load the new customer asset (avoid spaces in filename)
  this.load.image('customer1', './assets/Customer__1-removebg-preview.png');
  // Also attempt to load the raw filename; some environments resolve raw paths better
  this.load.image('customer1_raw', './assets/Customer__1-removebg-preview.png');
  // additional customer images
  this.load.image('customer2', './assets/Customer2-removebg-preview.png');
  this.load.image('customer2_raw', './assets/Customer2-removebg-preview.png');
  this.load.image('customer3', './assets/Customer3-removebg-preview.png');
  this.load.image('customer3_raw', './assets/Customer3-removebg-preview.png');
  this.load.image('customer4', './assets/Customer4-removebg-preview.png');
  this.load.image('customer4_raw', './assets/Customer4-removebg-preview.png');
  this.load.image('customer5', './assets/Customer5-removebg-preview.png');
  this.load.image('customer5_raw', './assets/Customer5-removebg-preview.png');
  this.load.image('customer6', './assets/6-removebg-preview.png');
  this.load.image('customer6_raw', './assets/6-removebg-preview.png');
  this.load.image('customer7', './assets/C7-removebg-preview.png');
  this.load.image('customer7_raw', './assets/C7-removebg-preview.png');
  this.load.image('customer8', './assets/C8-removebg-preview.png');
  this.load.image('customer8_raw', './assets/C8-removebg-preview.png');
  this.load.image('customer9', './assets/C9-removebg-preview.png');
  this.load.image('customer9_raw', './assets/C9-removebg-preview.png');
  this.load.image('customer10', './assets/C10-removebg-preview.png');
  this.load.image('customer10_raw', './assets/C10-removebg-preview.png');
  // story character images
  this.load.image('villain', './assets/Villain1.png');
  this.load.image('Penelope', './assets/Penelope1.png');
  this.load.image('Fiona', './assets/Fiona.png');
  this.load.image('Philip', './assets/Philip.png');
  this.load.image('Ian', './assets/Ia1.png');
  this.load.image('Debbie', './assets/Debbie.png');
  this.load.image('Carl', './assets/Carl.png');
  this.load.image('Liam', './assets/Liam.png');
  this.load.image('Gray', './assets/Gray.png');
  // OTH special character images
  this.load.image('Lucas', './assets/Luc.png');
  this.load.image('Nathan', './assets/Nath.png');
  this.load.image('Haley', './assets/Halez.png');
  this.load.image('Peyton', './assets/peyt.png');
  this.load.image('Brooke', './assets/Brooke.png');
  this.load.image('Callisto', './assets/Callisto.png');
  // OTH collection images
  this.load.image('Lucas2', './assets/Lucas2.png');
  this.load.image('Nathan2', './assets/Nathan2.png');
  this.load.image('Haley2', './assets/Haley2.png');
  this.load.image('Peyton2', './assets/Peyton2.png');
  this.load.image('Brooke2', './assets/Brooke2.png');
  this.load.image('Callisto2', './assets/Callisto2.png');
  // TVD special character images
  this.load.image('Stefan', './assets/St.png');
  this.load.image('Damon', './assets/Damon1.png');
  this.load.image('Elena', './assets/Elena.png');
  this.load.image('Caroline', './assets/Carol.png');
  this.load.image('Bonnie', './assets/Bonnie.png');
  // TVD collection images
  this.load.image('Stefan2', './assets/Stefan2.png');
  this.load.image('Damon2', './assets/Damon2.png');
  this.load.image('Elena2', './assets/Elena2.png');
  this.load.image('Caroline2', './assets/Caroline2.png');
  this.load.image('Bonnie2', './assets/Bonnie2.png');
  // special images
  this.load.image('BobaCorp_raw', './assets/BobaCorp.png');
  this.load.image('Thank_You', './assets/Ty.png');
  this.load.image('Thank_You1', './assets/Ty3.png');
  // special group collection images
  this.load.image('OTHU', './assets/OTHU.png');
  this.load.image('TVDU', './assets/tvdbg.png');
  this.load.image('Shameless', './assets/ShamU.png');
  this.load.image('VDD', './assets/VDD.png');
  // boba topping image
  this.load.image('Boba_img', './assets/boba_small.png');
  // background music (place BgSong.ogg in ./assets/)
}

// Resize and center the HTML background image to match the Phaser game's configured canvas size,
// while preserving the image's aspect ratio.
function adjustMenuBgToGame(scene) {
  try {
    const el = document.getElementById('menuBgImg');
    if (!el) return;
    // prefer the actual rendered canvas size (in case the canvas is scaled by CSS)
    const canvas = scene.sys.game && scene.sys.game.canvas ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
    let targetW = scene.sys.game.config.width;
    let targetH = scene.sys.game.config.height;
    let left = Math.max(0, Math.floor((window.innerWidth - targetW) / 2));
    let top = Math.max(0, Math.floor((window.innerHeight - targetH) / 2));
    if (canvas && canvas.clientWidth && canvas.clientHeight) {
      targetW = canvas.clientWidth;
      targetH = canvas.clientHeight;
      const rect = canvas.getBoundingClientRect();
      left = Math.floor(rect.left);
      top = Math.floor(rect.top);
    }
  // allow a global override of menu scale for quick tuning in the browser console
  const scale = (window._boba_menu_scale && Number(window._boba_menu_scale)) ? Number(window._boba_menu_scale) : 0.85;
  const appliedW = Math.max(16, Math.floor(targetW * scale));
  const appliedH = Math.max(16, Math.floor(targetH * scale));
  // center the (smaller) image over the canvas area
  const offsetLeft = left + Math.floor((targetW - appliedW) / 2);
  const offsetTop = top + Math.floor((targetH - appliedH) / 2);
  // set size and preserve aspect using contain so the image fits without cropping
  el.style.position = 'fixed';
  el.style.width = appliedW + 'px';
  el.style.height = appliedH + 'px';
  el.style.left = offsetLeft + 'px';
  el.style.top = offsetTop + 'px';
  el.style.objectFit = 'contain';
  el.style.zIndex = '0';
  console.log('adjustMenuBgToGame:', { canvasW: targetW, canvasH: targetH, appliedW, appliedH, offsetLeft, offsetTop, scale });
  } catch (e) {
    // ignore
  }
}

function create() {
  const scene = this;
  // keep a reference to the active scene for DOM positioning helpers
  try { window._boba_scene = scene; } catch (e) {}
  // start background music if available
  try {
    if (scene && scene.sound) {
      try {
        // avoid starting multiple times during hot-reload
        if (!window._boba_bgMusic || !window._boba_bgMusic.isPlaying) {
          window._boba_bgMusic = scene.sound.add('bgmusic', { loop: true, volume: 0.5 });
          window._boba_bgMusic.play().catch(() => {});
        }
      } catch (e) {}
    }
  } catch (e) {}
  // expose toggle helper for debugging
  try { window._boba_toggleMusic = (on) => { try { if (!window._boba_bgMusic) return; if (typeof on === 'boolean') { if (on) window._boba_bgMusic.setMute(false); else window._boba_bgMusic.setMute(true); } else { window._boba_bgMusic.setMute(!window._boba_bgMusic.mute); } } catch (e) {} }; } catch (e) {}
  // expose size/flavor/topping choices for orders logic
  // (uiGroup contains UI elements; cupGroup was unused and removed)
  uiGroup = scene.add.group();
  // Simple store background: wall, shelf, counter (created but hidden until after title)
  pageBackground = scene.add.rectangle(500, 330, 1000, 660, 0xf7f2ee).setVisible(false); // overall
    const wall = scene.add.rectangle(500, 250, 920, 420, 0xfff6ec).setStrokeStyle(0, 0);
  // Orders panel size is defined via constants; actual drawing happens in createOrdersUI
  // remove visible wall fill so UI background is not the cream color
  try { wall.setAlpha(0); } catch (e) {}
  // shelf (left area)
  // shelf decorations removed to avoid overlapping the receipt area
  // counter across bottom (made transparent to remove cream background)
  const counter = scene.add.rectangle(500, 520, 920, 220, 0xf0e6db).setStrokeStyle(2, 0xd6c3b4);
  try { counter.setAlpha(0); } catch (e) {}

  // Right-side UI panel (distinct area so it never overlaps cup)
  const panelCenterX = 760;
  const panelCenterY = 330 + makerYOffset;
  const panelW = 420;
  const panelH = 560;
  const panel = scene.add.rectangle(panelCenterX, panelCenterY, panelW, panelH, 0xffffff).setStrokeStyle(2, 0xccc7c0);
  uiGroup.add(panel);


  // Cup display area (left side) - smaller rounded panel with no shadow so it doesn't cover the title
  const cupAreaBg = scene.add.graphics();
  cupAreaBg.fillStyle(0xffffff, 1);
  // make the cup panel just a little taller (height 480) and keep it centered at y=320
  cupAreaBg.fillRoundedRect(300 - 220, 320 - 240 + makerYOffset, 440, 480, 12);
  cupAreaBg.lineStyle(3, 0xdcdcdc, 1);
  cupAreaBg.strokeRoundedRect(300 - 220, 320 - 240 + makerYOffset, 440, 480, 12);
  uiGroup.add(cupAreaBg);

  // Create 4 cup size buttons
  const sizes = [
    { key: 'Tiny', radius: 60 },
    { key: 'Small', radius: 80 },
    { key: 'Medium', radius: 100 },
    { key: 'Large', radius: 120 }
  ];
  window._BA_SIZES = sizes;

  // Right-side UI panel
  // uiX is the left margin inside the panel where controls start
  const uiX = panelCenterX - panelW/2 + 24; // left padding inside panel
  // expose maker layout anchors for shop-to-maker wiring
  makerUIX = uiX;
  // Sizes laid out horizontally at top of panel to save vertical space
  const chooseSizeText = scene.add.text(uiX, 50 + makerYOffset, 'Choose size:', { font: 'bold 18px Poppins', fill: '#333' });
  uiGroup.add(chooseSizeText);

  sizes.forEach((s, i) => {
  const x = uiX + 20 + i * 96; // horizontal spacing
  const y = 110 + makerYOffset; // fixed row (center of the box)
    const boxW = 76;
    const boxH = 76;
    // container for the rounded cube + cup art + label
    const boxContainer = scene.add.container(x + 36, y);

    // rounded cube background (slightly 3D with a highlight)
    const bg = scene.add.graphics();
    // base
    bg.fillStyle(0xf1e6e6, 1);
    bg.fillRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 12);
    // stroke
    bg.lineStyle(2, 0x9b7b7b, 1);
    bg.strokeRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 12);
    // subtle top highlight to imply a beveled face
    const hl = scene.add.graphics();
    hl.fillStyle(0xffffff, 0.12);
    hl.fillRoundedRect(-boxW/2 + 6, -boxH/2 + 6, boxW - 12, Math.max(10, Math.floor(boxH * 0.26)), 8);
    boxContainer.add(bg);
    boxContainer.add(hl);

    // mini cup illustration scaled by size.radius
    const cupArt = scene.add.graphics();
    try {
      const baseW = 40; const baseH = 56; const maxRadius = 120;
      const scale = Math.max(0.5, Math.min(1.2, s.radius / maxRadius));
      const w = Math.floor(baseW * scale);
      const h = Math.floor(baseH * scale);
      const topW = w;
      const bottomW = Math.max(10, Math.floor(w * 0.6));
      const topY = -Math.floor(h/2) + 6;
      const bottomY = Math.floor(h/2) - 6;
      // liquid / glass fill
      cupArt.fillStyle(0xf0e7df, 1);
      cupArt.beginPath();
      cupArt.moveTo(-topW/2, topY);
      cupArt.lineTo(topW/2, topY);
      cupArt.lineTo(bottomW/2, bottomY);
      cupArt.lineTo(-bottomW/2, bottomY);
      cupArt.closePath();
      cupArt.fillPath();
      // glare
      cupArt.fillStyle(0xffffff, 0.18);
      cupArt.fillEllipseShape(new Phaser.Geom.Ellipse(-Math.floor(topW*0.18), topY + Math.max(6, Math.floor(h*0.12)), Math.max(6, Math.floor(w*0.22)), Math.max(6, Math.floor(h*0.32))));
      // outline
      cupArt.lineStyle(2, 0xcfc7c3, 1);
      cupArt.beginPath();
      cupArt.moveTo(-topW/2, topY);
      cupArt.lineTo(topW/2, topY);
      cupArt.lineTo(bottomW/2, bottomY);
      cupArt.lineTo(-bottomW/2, bottomY);
      cupArt.closePath();
      cupArt.strokePath();
    } catch (e) {}
    boxContainer.add(cupArt);

    // label below the box
    const label = scene.add.text(0, Math.floor(boxH/2) + 8, s.key, { font: 'bold 14px Poppins', fill: '#3b2b2b' });
    label.setOrigin(0.5, 0);
    boxContainer.add(label);

  // interactive hit rectangle centered on the boxContainer (use an invisible rectangle so hitbox matches visuals)
  const hit = scene.add.rectangle(0, 0, boxW, boxH, 0x000000, 0).setOrigin(0.5).setInteractive();
  hit.input.cursor = 'pointer';
  boxContainer.add(hit);
    // pointer animations and click
    hit.on('pointerdown', () => {
      // small press animation
      const baseY = boxContainer.y;
      scene.tweens.killTweensOf(boxContainer);
      const pressDistance = 3;
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 90, ease: 'Quad.easeOut', yoyo: true,
        onUpdate: (t) => {
          const v = t.getValue();
          boxContainer.y = baseY + v * pressDistance;
          boxContainer.scale = 1 - v * 0.02;
        },
        onComplete: () => { boxContainer.y = baseY; boxContainer.scale = 1; }
      });
      selectSize(scene, s);
    });
    hit.on('pointerover', () => scene.tweens.add({ targets: boxContainer, scale: 1.06, duration: 120 }));
    hit.on('pointerout', () => scene.tweens.add({ targets: boxContainer, scale: 1.0, duration: 120 }));

    // add to uiGroup so visibility toggles with Maker
    uiGroup.add(boxContainer);
  });

  // Flavor buttons
  // Master flavor list (20 total available in-game)
  const allFlavors = [
    { key: 'Classic Milk Tea', color: 0xd6b08b },
    { key: 'Taro', color: 0xbd8be6 },
    { key: 'Matcha', color: 0xa6d393 },
    { key: 'Brown Sugar', color: 0xc07b3a },
    { key: 'Strawberry', color: 0xff97b7 },
    { key: 'Lavender', color: 0x9f7edc },
    { key: 'Oolong', color: 0xd9b38a },
    { key: 'Honeydew', color: 0xb8f0b0 },
    { key: 'Mango', color: 0xffc66b },
    { key: 'Thai Tea', color: 0xff8f3b },
    { key: 'Coffee', color: 0xa87f60 },
    { key: 'Jasmine', color: 0xe8f4d9 },
    { key: 'Almond', color: 0xf2e0d0 },
    { key: 'Black Tea', color: 0xc79a6b },
    { key: 'Earl Grey', color: 0xd7c6b7 },
    { key: 'Coconut', color: 0xffffff },
    { key: 'Lychee', color: 0xffe6f0 },
    { key: 'Passionfruit', color: 0xffe59a },
    { key: 'Hojicha', color: 0xb58f6b },
    { key: 'Pistachio', color: 0xcfe6c9 }
  ];
  // Additional requested flavors (unique, name-appropriate colors)
  allFlavors.push({ key: 'Toasted Marshmallow', color: 0xf6d4a4 }); // warm beige with light caramel
  allFlavors.push({ key: 'Oreo', color: 0xdadfe6 }); // light cookies-and-cream (pale gray)
  allFlavors.push({ key: 'Churro Cinnamon', color: 0xe0a36b }); // warm cinnamon brown
  allFlavors.push({ key: 'Banana', color: 0xfff2a8 }); // pale banana yellow
  allFlavors.push({ key: 'Vanilla Sugar', color: 0xfff8e6 }); // very pale vanilla cream
  allFlavors.push({ key: 'Lemon Honey', color: 0xfff1b8 }); // soft lemon-honey yellow
  allFlavors.push({ key: 'Green Tea', color: 0xc7e8b7 }); // light green tea tint
  allFlavors.push({ key: 'Peppermint Cocoa', color: 0xd5e7e7 }); // muted minty cocoa (pale teal-gray)
  allFlavors.push({ key: 'Soy Milk', color: 0xf2ecd9 }); // off-white soy milk tone
  allFlavors.push({ key: 'Genmaicha', color: 0xd9cfa3 }); // toasted rice green-brown
  allFlavors.push({ key: 'Avocado Mango', color: 0xd3f0a8 }); // light avocado-green with mango tint
  allFlavors.push({ key: 'Classic Vera Chai', color: 0xd9a76b }); // rich chai brown
  allFlavors.push({ key: 'Vanilla Bean Chai', color: 0xeed9b8 }); // creamy chai with vanilla tones
  allFlavors.push({ key: 'Chai Cream', color: 0xf0dcc2 }); // lighter creamy chai
  // global master list used for order generation
  window._BA_FLAVORS = allFlavors.slice();
  // initialize owned flavors with a small starter subset (player can buy the rest in shop)
  ownedFlavors = allFlavors.slice(0, 4);

  // Two-column layout: flavors on the left, toppings on the right
  const colLeft = uiX + 12;
  const colRight = uiX + Math.floor(panelW / 2) + 6;
  makerColLeft = colLeft;
  makerColRight = colRight;

  // create scrollable content containers for flavors and toppings so they don't overflow
  // these containers will be masked to a visible height so items can be scrolled
  const makerStartY = 220 + makerYOffset;
  const makerSlotH = 48;
  // add a small bottom padding so the last slot isn't visually clipped by the mask
  const makerVisiblePadding = 12;
  const makerVisibleH = Math.max(120, panelH - makerStartY - 160) + makerVisiblePadding; // keep some bottom gap for action buttons
  // flavor content container (children positions are local to the container)
  makerFlavorsContent = scene.add.container(colLeft, makerStartY);
  // topping content container
  makerToppingsContent = scene.add.container(colRight, makerStartY);
  // add maker columns into the uiGroup so visibility toggles with the Maker UI
  uiGroup.add(makerFlavorsContent);
  uiGroup.add(makerToppingsContent);

  // masks for both columns
  const flavorMaskG = scene.add.graphics();
  flavorMaskG.fillStyle(0xffffff, 1);
  flavorMaskG.fillRect(colLeft, makerStartY, 220, makerVisibleH);
  flavorMaskG.setVisible(false);
  const flavorMask = flavorMaskG.createGeometryMask();
  makerFlavorsContent.setMask(flavorMask);

  const toppingMaskG = scene.add.graphics();
  toppingMaskG.fillStyle(0xffffff, 1);
  toppingMaskG.fillRect(colRight, makerStartY, 180, makerVisibleH);
  toppingMaskG.setVisible(false);
  const toppingMask = toppingMaskG.createGeometryMask();
  makerToppingsContent.setMask(toppingMask);

  // scrolling state
  makerFlavorsContent._scrollY = 0;
  makerFlavorsContent._maxScroll = 0;
  makerFlavorsContent._visibleHeight = makerVisibleH;
  makerFlavorsContent._dragging = false;
  makerFlavorsContent._lastY = 0;

  makerToppingsContent._scrollY = 0;
  makerToppingsContent._maxScroll = 0;
  makerToppingsContent._visibleHeight = makerVisibleH;
  makerToppingsContent._dragging = false;
  makerToppingsContent._lastY = 0;

  const chooseFlavorText = scene.add.text(colLeft, 180 + makerYOffset, 'Choose flavor:', { font: 'bold 18px Poppins', fill: '#333' });
  uiGroup.add(chooseFlavorText);
  uiGroup.add(chooseFlavorText);
  // helper hint to indicate the flavor column is scrollable
  const scrollHint = scene.add.text(colLeft, 180 + makerYOffset + 22, 'scroll down', { font: '12px Poppins', fill: '#666' });
  uiGroup.add(scrollHint);

  // populate Maker flavor buttons from ownedFlavors only (inside the scrollable container)
  // center each item within its slot so the top isn't clipped by the mask
  ownedFlavors.forEach((f, i) => {
    const localY = i * makerSlotH + Math.floor(makerSlotH / 2);
    const btn = scene.add.rectangle(110, localY, 200, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b).setOrigin(0.5,0.5);
  const label = scene.add.text(12, localY - 8, f.key, { font: 'bold 14px Poppins', fill: '#3b2b2b' });
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => selectFlavor(scene, f))
      .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
      .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
    makerFlavorsContent.add(btn);
    makerFlavorsContent.add(label);
  });
  // update flavor content max scroll
  makerFlavorsContent._maxScroll = Math.max(0, ownedFlavors.length * makerSlotH - makerFlavorsContent._visibleHeight);

  // Toppings palette
  // Master toppings list (20 total available in-game)
  const allToppings = [
    { key: 'Boba', color: 0x241f1f },
    { key: 'Mochi', color: 0xffc9d1 },
    { key: 'Pudding', color: 0xf0c969 },
    { key: 'Jelly', color: 0x8be3ff },
    { key: 'Red Bean', color: 0xbf6b6b },
    { key: 'Aloe', color: 0x9be6b8 },
    { key: 'Coconut', color: 0xffffff },
    { key: 'Grass Jelly', color: 0x3b6b6b },
    { key: 'Popping Boba', color: 0xffb3d9 },
    { key: 'Crystal Boba', color: 0xdde6ff },
    { key: 'Coffee Jelly', color: 0x6b4f3b },
    { key: 'Taro Balls', color: 0xd7b3ff },
    { key: 'Egg Pudding', color: 0xffe6b3 },
    { key: 'Tapioca', color: 0x3a2f2f },
    { key: 'Marshmallow', color: 0xfff0f0 },
    { key: 'Mango Bits', color: 0xffd28a },
    { key: 'Rainbow Jelly', color: 0xffb3ff },
    { key: 'Chia Seeds', color: 0x9a8f66 },
    { key: 'Oat Granola', color: 0xd6caae },
    { key: 'Honey Pearls', color: 0xffdca3 }
  ];
  // New toppings added by user request (available in shop, not owned by default)
  allToppings.push({ key: 'Cookie', color: 0xd2b48c });
  allToppings.push({ key: 'Rainbow Boba', color: 0xff6ec7 });
  allToppings.push({ key: 'Mystery Boba', color: 0x8f6bff });
  allToppings.push({ key: 'Sun Jelly', color: 0xffe36b });
  allToppings.push({ key: 'Star Boba', color: 0xffe6a8 });
  // Additional toppings requested
  allToppings.push({ key: 'Matcha Boba', color: 0x3f8b4a });
  allToppings.push({ key: 'Yogurt Boba', color: 0xf6f7f9 });
  allToppings.push({ key: 'Custard Cubes', color: 0xf0c969 });
  allToppings.push({ key: 'Sweet Corn', color: 0xfff6a8 });
  allToppings.push({ key: 'Sea Salt Caramel Cubes', color: 0xd9b38a });
  allToppings.push({ key: 'Pistachio Crumbs', color: 0x8fb38a });
  allToppings.push({ key: 'Jasmine Pearls', color: 0xfff2d9 });
  allToppings.push({ key: 'Lavender Pearls', color: 0xd7c7ff });
  allToppings.push({ key: 'Tea Jelly', color: 0xb88b5a });
  allToppings.push({ key: 'Ube Pudding', color: 0x6f3fa6 });
  allToppings.push({ key: 'Blueberry Jelly', color: 0x6b5fd9 });
  allToppings.push({ key: 'Peach Jelly', color: 0xffc9a8 });
  allToppings.push({ key: 'Konjac Jelly', color: 0xcfcfcf });
  window._BA_TOPPINGS = allToppings.slice();
  // initialize owned toppings with a small starter subset
  ownedToppings = allToppings.slice(0, 4);

  // populate Maker topping buttons from ownedToppings only (inside the scrollable container)
  // center each item within its slot so the top isn't clipped by the mask
  ownedToppings.forEach((t, i) => {
    const localY = i * makerSlotH + Math.floor(makerSlotH / 2);
    const btn = scene.add.rectangle(90, localY, 160, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b).setOrigin(0.5,0.5);
  const label = scene.add.text(12, localY - 8, t.key, { font: 'bold 14px Poppins', fill: '#3b2b2b' });
    btn.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        try { addTopping(scene, t); } catch (e) {}
      })
      .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
      .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
    makerToppingsContent.add(btn);
    // simple textual label for toppings
    try { makerToppingsContent.add(label); } catch (e) { }
  });
  // update topping content max scroll
  makerToppingsContent._maxScroll = Math.max(0, ownedToppings.length * makerSlotH - makerToppingsContent._visibleHeight);

  // Add a header title above the toppings column
  try {
    const toppingsHeader = scene.add.text(makerColRight, 180 + makerYOffset, 'Choose Toppings:', { font: 'bold 18px Poppins', fill: '#333' });
    toppingsHeader.setOrigin(0.0, 0.0);
    uiGroup.add(toppingsHeader);
  } catch (e) {}

  // add an invisible interactive overlay per column to enable drag-start for scrolling
  // place these inside the column containers as the first child so they sit behind the buttons
  const flavorHit = scene.add.rectangle(110, makerVisibleH / 2, 220, makerVisibleH, 0xffffff, 0).setInteractive();
  flavorHit.on('pointerdown', (p) => { makerFlavorsContent._dragging = true; makerFlavorsContent._lastY = p.y; });
  makerFlavorsContent.addAt(flavorHit, 0);

  const toppingHit = scene.add.rectangle(90, makerVisibleH / 2, 180, makerVisibleH, 0xffffff, 0).setInteractive();
  toppingHit.on('pointerdown', (p) => { makerToppingsContent._dragging = true; makerToppingsContent._lastY = p.y; });
  makerToppingsContent.addAt(toppingHit, 0);

  // global pointer handling for drag end and move
  scene.input.on('pointerup', () => { makerFlavorsContent._dragging = false; makerToppingsContent._dragging = false; });
  scene.input.on('pointermove', (p) => {
    if (!makerFlavorsContent) return;
    if (makerFlavorsContent._dragging) {
      const dy = p.y - makerFlavorsContent._lastY;
      makerFlavorsContent._lastY = p.y;
      makerFlavorsContent._scrollY = Math.max(0, Math.min(makerFlavorsContent._maxScroll, makerFlavorsContent._scrollY - dy));
      makerFlavorsContent.y = makerStartY - makerFlavorsContent._scrollY;
    }
    if (makerToppingsContent._dragging) {
      const dy2 = p.y - makerToppingsContent._lastY;
      makerToppingsContent._lastY = p.y;
      makerToppingsContent._scrollY = Math.max(0, Math.min(makerToppingsContent._maxScroll, makerToppingsContent._scrollY - dy2));
      makerToppingsContent.y = makerStartY - makerToppingsContent._scrollY;
    }
  });
  // wheel handling so mouse wheel scrolls the list when pointer is over the column
  scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
    const px = pointer.worldX;
    const py = pointer.worldY;
    // flavor column area
    if (px >= colLeft && px <= colLeft + 220 && py >= makerStartY && py <= makerStartY + makerVisibleH) {
      makerFlavorsContent._scrollY = Math.max(0, Math.min(makerFlavorsContent._maxScroll, makerFlavorsContent._scrollY + deltaY * 0.5));
      makerFlavorsContent.y = makerStartY - makerFlavorsContent._scrollY;
    }
    // topping column area
    if (px >= colRight && px <= colRight + 180 && py >= makerStartY && py <= makerStartY + makerVisibleH) {
      makerToppingsContent._scrollY = Math.max(0, Math.min(makerToppingsContent._maxScroll, makerToppingsContent._scrollY + deltaY * 0.5));
      makerToppingsContent.y = makerStartY - makerToppingsContent._scrollY;
    }
  });

  // Action buttons: make Reset and Serve the same size and spaced apart
  const actionBtnW = 160;
  const actionBtnH = 56;
  const actionGap = 24;
  const leftCenterX = panelCenterX - (actionBtnW / 2 + actionGap / 2);
  const rightCenterX = panelCenterX + (actionBtnW / 2 + actionGap / 2);

  // Reset button (left)
  const resetBtn = scene.add.rectangle(leftCenterX, panelCenterY + panelH/2 - 56, actionBtnW, actionBtnH, 0xff6b6b).setStrokeStyle(2, 0x8b3a3a);
  const resetLabel = scene.add.text(0, 0, 'Reset', { font: 'bold 20px Poppins', fill: '#fff' });
  resetLabel.x = Math.floor(resetBtn.x - resetLabel.width / 2);
  resetLabel.y = Math.floor(resetBtn.y - resetLabel.height / 2);
  resetBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    reset(scene);
  });
  uiGroup.add(resetBtn);
  uiGroup.add(resetLabel);
  resetBtn.on('pointerover', () => scene.tweens.add({ targets: resetBtn, scale: 1.04, duration: 120 }));
  resetBtn.on('pointerout', () => scene.tweens.add({ targets: resetBtn, scale: 1.0, duration: 100 }));

  // Serve button (right)
  const serveBtn = scene.add.rectangle(rightCenterX, panelCenterY + panelH/2 - 56, actionBtnW, actionBtnH, 0x66bb6a).setStrokeStyle(2, 0x447a3d);
  const serveLabel = scene.add.text(0, 0, 'Serve Drink', { font: 'bold 20px Poppins', fill: '#fff' });
  serveLabel.x = Math.floor(serveBtn.x - serveLabel.width / 2);
  serveLabel.y = Math.floor(serveBtn.y - serveLabel.height / 2);
  serveBtn.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
    serveDrink(scene);
  });
  uiGroup.add(serveBtn);
  uiGroup.add(serveLabel);
  serveBtn.on('pointerover', () => scene.tweens.add({ targets: serveBtn, scale: 1.04, duration: 120 }));
  serveBtn.on('pointerout', () => scene.tweens.add({ targets: serveBtn, scale: 1.0, duration: 100 }));

  // ... Show Boba button removed per user request

  // Cup drawing container (left side) - moved down to fit inside the smaller panel
  cupSprites.container = scene.add.container(300, 320 + makerYOffset);
  drawCup(scene);

  // Orders UI (hidden by default)
  ordersContainer = scene.add.container(60, 100).setVisible(false);
  createOrdersUI(scene);

  // Bottom nav bar (centered) using styledButton
  {
    const navW = 160;
    const navH = 48;
    const gap = 20;
    const specs = [
      { label: 'Shop', color: 0xffb86b, onClick: () => showShopScreen(scene) },
  { label: 'Make', color: 0x9bd67a, onClick: () => showMakerScreen(scene) },
      { label: 'Orders', color: 0x5daee8, onClick: () => showOrdersScreen(scene) },
  { label: 'Collection', color: 0xd39be8, onClick: () => showCollectionScreen(scene) },
  { label: 'Pet', color: 0xf2a6d9, onClick: () => showPetScreen(scene) }
    ];
    const totalW = specs.length * navW + (specs.length - 1) * gap;
    const startX = Math.floor((scene.sys.game.config.width - totalW) / 2);
  // place nav slightly lower so it clears other UI and isn't clipped on small viewports
  const navY = scene.sys.game.config.height - navH - 30 + makerYOffset; // 16px from bottom, nudged down
    // we'll keep a reference to the Pet button so we can enable it later
    let petNavBtn = null;
    const updatePetNavVisual = (btn, unlocked) => {
      try {
        if (!btn) return;
        // make it gray and non-interactive when locked
        if (!unlocked) {
          // make visuals noticeably dimmer and text gray
          btn.list && btn.list.forEach(ch => {
            try {
              // dim graphics and text
              if (ch && ch.setAlpha) ch.setAlpha(0.45);
              // if it's a text object, set a gray fill
              if (ch && ch.setStyle) { try { ch.setStyle({ fill: '#9b9b9b' }); } catch(e){} }
              // if it's an interactive zone, make cursor default
              if (ch && ch.input && ch.input.cursor) { try { ch.input.cursor = 'default'; } catch(e){} }
            } catch (e) {}
          });
          // disable interaction on the hit zone if present
          try { const zones = btn.list && btn.list.filter(x => x && x.input && x.input.enabled); if (zones && zones.length) zones.forEach(z => z.disableInteractive && z.disableInteractive()); } catch (e) {}
        } else {
          // restore normal visuals
          btn.list && btn.list.forEach(ch => {
            try {
              if (ch && ch.setAlpha) ch.setAlpha(1.0);
              if (ch && ch.setStyle) { try { ch.setStyle({ fill: '#ffffff' }); } catch(e){} }
              if (ch && ch.input && ch.input.cursor) { try { ch.input.cursor = 'pointer'; } catch(e){} }
            } catch (e) {}
          });
          try { const zones = btn.list && btn.list.filter(x => x && x.input && !x.input.enabled); if (zones && zones.length) zones.forEach(z => z.setInteractive && z.setInteractive(new Phaser.Geom.Rectangle(0,0,btn.width||160,btn.height||48), Phaser.Geom.Rectangle.Contains)); } catch (e) {}
        }
      } catch (e) {}
    };

    specs.forEach((s, i) => {
      const x = startX + i * (navW + gap);
  const btn = styledButton(scene, x, navY, navW, navH, s.color, s.label, s.onClick);
  // ensure nav buttons sit on top so they remain clickable
  btn.setDepth(1000 + i);
  // add subtle pattern stripe to button and keep it above other UI
  const stripe = scene.add.graphics();
  stripe.fillStyle(0xffffff, 0.06);
  stripe.fillRect(x + 8, navY + navH - 12, navW - 16, 6);
  stripe.setDepth(1100 + i);
      // capture the Pet button ref
      try { if (s.label === 'Pet') petNavBtn = btn; } catch (e) {}
      // initialize Pet nav as locked if not unlocked yet
      try { if (s.label === 'Pet' && !petUnlocked) updatePetNavVisual(petNavBtn, false); } catch (e) {}
    });

    // expose helper to enable the pet nav later when story completes
    try { window._boba_enablePetNav = () => { try { petUnlocked = true; updatePetNavVisual(petNavBtn, true); } catch (e) {} }; } catch (e) {}
  }
  // also expose helper to enable the DOM nav Pet button (for Collection DOM nav)
  try { window._boba_enablePetDomNav = () => { try { petUnlocked = true; if (window._boba_petDomNavBtn) { try { window._boba_petDomNavBtn.style.opacity = '1.0'; window._boba_petDomNavBtn.style.pointerEvents = 'auto'; window._boba_petDomNavBtn.style.cursor = 'pointer'; } catch (e) {} } } catch (e) {} }; } catch (e) {}

  // Money HUD (rounded background + text) anchored to top-right
  // create text centered inside the background
  const txt = scene.add.text(0, 0, `Money: $${money}`, { font: 'bold 16px Poppins', fill: '#2a7a3a' });
  txt.setOrigin(0.5, 0.5);
  // background size
  // draw bg sized to text + padding and center text inside it
  const bgW = Math.max(80, txt.width + moneyHudPadding * 2);
  const bgH = Math.max(28, txt.height + moneyHudPadding * 2);
  moneyBg = scene.add.graphics();
  moneyBg.fillStyle(0xfffbdb, 1);
  moneyBg.fillRoundedRect(0, 0, bgW, bgH, 8);
  moneyBg.lineStyle(2, 0xf0d88a, 1);
  moneyBg.strokeRoundedRect(0, 0, bgW, bgH, 8);
  moneyText = txt;
  // place text at center of bg
  moneyText.x = Math.floor(bgW / 2);
  moneyText.y = Math.floor(bgH / 2);
  moneyHudContainer = scene.add.container(0, 0, [moneyBg, moneyText]);
  moneyHudContainer.setDepth(2500);
  // coin HUD: small counter shown under money
  try {
    coinText = scene.add.text(0, 0, `Coins: ${coins}`, { font: 'bold 13px Poppins', fill: '#b08a00' });
    coinText.setOrigin(0.5, 0.5);
    const cW = Math.max(60, coinText.width + moneyHudPadding * 2);
    const cH = Math.max(20, coinText.height + moneyHudPadding);
    coinBg = scene.add.graphics();
    coinBg.fillStyle(0xfffbdb, 1);
    coinBg.fillRoundedRect(0, 0, cW, cH, 6);
    coinBg.lineStyle(1, 0xf0d88a, 1);
    coinBg.strokeRoundedRect(0, 0, cW, cH, 6);
    coinHudContainer = scene.add.container(0, 0, [coinBg, coinText]);
    coinHudContainer.setDepth(2500);
  // Save/Load buttons will be created in the global actions area to the right of Next Day
    // center text
    coinText.x = Math.floor(cW / 2);
    coinText.y = Math.floor(cH / 2);
  } catch (e) {}
  // quick action buttons near money HUD: Next Day and Auto Complete
  try {
    const btnW = 120;
    const btnH = 34;
    const gap = 8;
    // position to the left of money HUD
    const actionsX = Math.max(12, (scene.sys.game.config.width || window.innerWidth) - 12 - btnW * 2 - gap - 100);
    // move actions slightly lower to avoid being clipped by browser UI / OS bars
  const actionsY = 12;
  // create a persistent actions container so buttons are visible across screens (except title)
  globalActionsContainer = scene.add.container(0,0);
  const nextDayBtn = styledButton(scene, actionsX, actionsY, btnW, btnH, 0xffb86b, 'Next Day', () => { try { startNextDay(scene); } catch (e) {} });
  const autoBtn = styledButton(scene, actionsX + btnW + gap, actionsY, btnW, btnH, 0xff6b6b, 'Auto Complete', () => { try { autoCompleteActiveOrder(scene); } catch (e) {} });
  // place Save/Load to the right of Auto Complete
  const saveBtnX = actionsX + (btnW + gap) * 2; // two slots right of Next Day
  const saveBtn = styledButton(scene, saveBtnX, actionsY, 90, btnH - 4, 0x4f9ef6, 'Save', () => {
    try {
      const payload = { day: dayNumber };
      try { payload.ownedFlavors = (ownedFlavors || []).map(f => f.key || f); } catch (e) { payload.ownedFlavors = []; }
      try { payload.ownedToppings = (ownedToppings || []).map(t => t.key || t); } catch (e) { payload.ownedToppings = []; }
      try { payload.money = (typeof money === 'number') ? money : Number(money) || 0; } catch (e) { payload.money = 0; }
      try { payload.collected = Object.keys(collectedCharacters || {}).filter(k => !!collectedCharacters[k]); } catch (e) { payload.collected = []; }
      try {
        const b = { tvdu: false, othu: false, vdd: false, sham: false };
        try {
          if (ordersContainer && ordersContainer.tvduImage && typeof ordersContainer.tvduImage.visible !== 'undefined') b.tvdu = !!ordersContainer.tvduImage.visible;
          else {
            const td = document.getElementById('ordersTvduWrap') || (ordersContainer && ordersContainer._tvduDom);
            try { if (td && td.style && td.style.display && td.style.display !== 'none') b.tvdu = true; } catch (e) {}
          }
        } catch (e) {}
        try {
          if (ordersContainer && ordersContainer.othuImage && typeof ordersContainer.othuImage.visible !== 'undefined') b.othu = !!ordersContainer.othuImage.visible;
          else {
            const od = document.getElementById('ordersOthuWrap') || (ordersContainer && ordersContainer._othuDom);
            try { if (od && od.style && od.style.display && od.style.display !== 'none') b.othu = true; } catch (e) {}
          }
        } catch (e) {}
        try {
          if (ordersContainer && ordersContainer.vddImage && typeof ordersContainer.vddImage.visible !== 'undefined') b.vdd = !!ordersContainer.vddImage.visible;
          else {
            const vd = document.getElementById('ordersVddWrap') || (ordersContainer && ordersContainer._vddDom);
            try { if (vd && vd.style && vd.style.display && vd.style.display !== 'none') b.vdd = true; } catch (e) {}
          }
        } catch (e) {}
        try {
          const p = document.getElementById('persistentImageOverlay');
          if (p && p.style && p.style.display && p.style.display !== 'none') b.sham = true;
          if (!b.sham) try { if (window._orders_shamu_shown) b.sham = true; } catch (e) {}
        } catch (e) {}
        payload.badges = b;
      } catch (e) { payload.badges = {}; }
      localStorage.setItem('boba_saved', JSON.stringify(payload));
      console.log('Saved state', payload);
    } catch (e) {}
  });
  const loadBtn = styledButton(scene, saveBtnX + 90 + 8, actionsY, 90, btnH - 4, 0x7adf8f, 'Load', () => {
    try {
      const raw = localStorage.getItem('boba_saved');
      if (!raw) return;
      const payload = JSON.parse(raw);
      const s = parseInt(payload && payload.day, 10);
      if (!s || isNaN(s) || s < 1) return;
      // restore day
      dayNumber = s;
      // restore money if present
      try {
        if (payload && (typeof payload.money === 'number' || !isNaN(Number(payload.money)))) {
          money = Number(payload.money);
          try { updateMoneyText(scene); } catch (e) {}
        }
      } catch (e) {}
      dayServedCount = 0;
      dayStartMoney = money;
      customersEnabled = true;
      // restore owned flavors/toppings if present
      try {
        if (payload && Array.isArray(payload.ownedFlavors)) {
          const master = window._BA_FLAVORS || [];
          try {
            const saved = payload.ownedFlavors.map(k => master.find(m => m.key === k)).filter(Boolean);
            const existingKeys = new Set((ownedFlavors || []).map(f => f && f.key));
            ownedFlavors = (ownedFlavors || []).slice();
            saved.forEach(s => { if (s && !existingKeys.has(s.key)) { ownedFlavors.push(s); existingKeys.add(s.key); } });
          } catch (e) {}
        }
      } catch (e) {}
      try {
        if (payload && Array.isArray(payload.ownedToppings)) {
          const masterT = window._BA_TOPPINGS || [];
          try {
            const savedT = payload.ownedToppings.map(k => masterT.find(m => m.key === k)).filter(Boolean);
            const existingT = new Set((ownedToppings || []).map(t => t && t.key));
            ownedToppings = (ownedToppings || []).slice();
            savedT.forEach(s => { if (s && !existingT.has(s.key)) { ownedToppings.push(s); existingT.add(s.key); } });
          } catch (e) {}
        }
      } catch (e) {}
      activeOrder = generateRandomOrder();
      try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
      // restore collected characters (merge, do not remove existing)
      try {
        if (payload && Array.isArray(payload.collected)) {
          try {
            const savedKeys = payload.collected.filter(Boolean).map(k => String(k));
            try { collectedCharacters = collectedCharacters || {}; } catch (e) { collectedCharacters = {}; }
            savedKeys.forEach(k => { try { collectedCharacters[k] = true; } catch (e) {} });
          } catch (e) {}
        }
      } catch (e) {}
      // restore badge/persistent image state
      try {
        if (payload && payload.badges) {
          try {
            const b = payload.badges || {};
            if (b.tvdu) try { window._orders_tvdu_shown = true; window._orders_tvdu_persistent = true; } catch (e) {}
            if (b.othu) try { window._orders_othu_shown = true; window._orders_othu_persistent = true; } catch (e) {}
            if (b.vdd) try { window._orders_vdd_shown = true; window._orders_vdd_persistent = true; } catch (e) {}
            if (b.sham) {
              try { window._orders_shamu_shown = true; } catch (e) {}
              try { showPersistentImage('ShamU.png'); } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {}
      try { if (dayText) dayText.setText(`Day ${dayNumber}`); refreshDayContainer(); } catch (e) {}
      try { refreshOrdersUI(scene); } catch (e) {}
      try { createShopUI(scene); } catch (e) {}
      try { updateMakerUI(scene); } catch (e) {}
      try {
        try { if (window._orders_othu_shown && ordersContainer && ordersContainer.othuImage) { ordersContainer.othuImage.setVisible(true); if (ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(true); } } catch (e) {}
        try { if (window._orders_tvdu_shown && ordersContainer && ordersContainer.tvduImage) { ordersContainer.tvduImage.setVisible(true); if (ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(true); } } catch (e) {}
        try { if (window._orders_vdd_shown && ordersContainer && ordersContainer.vddImage) { ordersContainer.vddImage.setVisible(true); if (ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(true); } } catch (e) {}
        try { const od = ordersContainer && ordersContainer._othuDom; if (od && window._orders_othu_shown) od.style.display = 'block'; } catch (e) {}
        try { const td = ordersContainer && ordersContainer._tvduDom; if (td && window._orders_tvdu_shown) td.style.display = 'block'; } catch (e) {}
        try { const vd = ordersContainer && ordersContainer._vddDom; if (vd && window._orders_vdd_shown) vd.style.display = 'block'; } catch (e) {}
        try { if (window._orders_shamu_shown) { try { showPersistentImage('ShamU.png'); } catch (e) {} } } catch (e) {}
      } catch (e) {}
      try { showOrdersScreen(scene); } catch (e) {}
      try { ensureOrdersBadgesVisibility(); } catch (e) {}
    } catch (e) {}
  });
  nextDayBtn.setDepth(2600);
  autoBtn.setDepth(2600);
  saveBtn.setDepth(2600);
  loadBtn.setDepth(2600);
  globalActionsContainer.add(nextDayBtn);
  globalActionsContainer.add(autoBtn);
  globalActionsContainer.add(saveBtn);
  globalActionsContainer.add(loadBtn);
  globalActionsContainer.setDepth(2600);
  } catch (e) {}

  // Day tracker: bordered container to the left of the receipt
  // place the day counter a bit lower so it's not hidden by the browser chrome on small viewports
  dayContainer = scene.add.container(12, 12);
  dayContainer.setDepth(2500);
  // background box (will be resized when text updates)
  const dayBg = scene.add.graphics();
  dayBg.fillStyle(0xfffbdb, 1);
  dayBg.fillRoundedRect(0, 0, 140, 36, 8);
  dayBg.lineStyle(2, 0xf0d88a, 1);
  dayBg.strokeRoundedRect(0, 0, 140, 36, 8);
  dayContainer.bg = dayBg;
  dayContainer.add(dayBg);
  dayText = scene.add.text(12, 8, `Day ${dayNumber}`, { font: 'bold 14px Poppins', fill: '#2b2b2b' });
  dayContainer.add(dayText);
  // initial sizing
  refreshDayContainer();
  // keep dayContainer separate so it remains visible across UI screens (except title overlay)

  // Helper: force the OTHU badge to appear (for testing). Does not modify collectedCharacters.
  function spawnOthuBadge(scene) {
    try {
      // Only allow this debug helper to show the OTHU badge when Orders screen is active.
      try { if (typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return; } catch (e) {}
      // prefer using updateOTHUVisibility logic but force visibility directly for both paths
      if (ordersContainer && ordersContainer.othuImage) {
        try { ordersContainer.othuImage.setVisible(true); } catch (e) {}
        try { if (ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(true); } catch (e) {}
      }
  // mark as shown/persistent so it remains visible for Orders sessions
  try { window._orders_othu_shown = true; window._orders_othu_persistent = true; } catch (e) {}
      try {
        const d = ordersContainer && ordersContainer._othuDom;
        if (d) {
          try { d.style.display = 'block'; } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {}
  }

  // Create a small debug button under the dayContainer to force-show the OTHU badge
  try {
    const btn = styledButton(scene, 12, 12 + 44, 120, 28, 0x5daee8, 'Show Badge', () => { try { spawnOthuBadge(scene); } catch (e) {} });
    btn.setDepth(2500);
    dayContainer.add(btn);
  } catch (e) {}

  // Helper: force the TVDU badge to appear (for testing). Does not modify collectedCharacters.
  function spawnTvduBadge(scene) {
    try {
      // Only allow this debug helper to show TVDU when Orders screen is active.
      try { if (typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return; } catch (e) {}
      if (ordersContainer && ordersContainer.tvduImage) {
        try { ordersContainer.tvduImage.setVisible(true); } catch (e) {}
        try { if (ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(true); } catch (e) {}
      }
  // mark as shown/persistent so it remains visible for Orders sessions
  try { window._orders_tvdu_shown = true; window._orders_tvdu_persistent = true; } catch (e) {}
      try {
        const d = ordersContainer && ordersContainer._tvduDom;
        if (d) {
          try { d.style.display = 'block'; } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {}
  }

  // Add a second debug button to force-show the TVDU badge
  try {
    const btn2 = styledButton(scene, 12, 12 + 44 + 36, 120, 28, 0xff7ab6, 'Show TVDU', () => { try { spawnTvduBadge(scene); } catch (e) {} });
    btn2.setDepth(2500);
    dayContainer.add(btn2);
  } catch (e) {}

  // Helper: force the ShamU persistent postcard to appear (for testing)
  function spawnShamUBadge(scene) {
    try {
      // Only allow this debug helper to show ShamU when Orders screen is active.
      try {
        if (typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return;
        showPersistentImage('ShamU.png');
      } catch (e) {}
    } catch (e) {}
  }

  // Add a third debug button to force-show the ShamU postcard
  try {
  // Make the debug button inert when not on Orders to avoid accidental show during Maker/Shop
  const btn3 = styledButton(scene, 12, 12 + 44 + 36 + 36, 120, 28, 0xffd166, 'Show ShamU', () => { try { if (typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return; spawnShamUBadge(scene); } catch (e) {} });
    btn3.setDepth(2500);
    dayContainer.add(btn3);
  } catch (e) {}

  // Helper: force the VDD badge to appear (for testing). Does not modify permanent unlock flags.
  function spawnVddBadge(scene) {
    try {
      // Only allow this debug helper to show VDD when Orders screen is active.
      try { if (typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return; } catch (e) {}
      if (ordersContainer && ordersContainer.vddImage) {
        try { ordersContainer.vddImage.setVisible(true); } catch (e) {}
        try { if (ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(true); } catch (e) {}
      }
    // mark as shown/persistent so it remains visible for Orders sessions
    try { window._orders_vdd_shown = true; window._orders_vdd_persistent = true; } catch (e) {}
      try {
        const d = ordersContainer && ordersContainer._vddDom;
        if (d) {
          try { d.style.display = 'block'; } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {}
  }

  // Add a debug button to spawn VDD (under the ShamU button)
  try {
    const btn4 = styledButton(scene, 12, 12 + 44 + 36 + 36 + 36, 120, 28, 0x9b7edc, 'Show VDD', () => { try { spawnVddBadge(scene); } catch (e) {} });
    btn4.setDepth(2500);
    dayContainer.add(btn4);
  } catch (e) {}

  // position once based on game config (places the container so the bg's right edge sits at gw - margin)
  function positionMoneyText(s) {
    try {
      const gw = (s && s.sys && s.sys.game && s.sys.game.config && s.sys.game.config.width) ? s.sys.game.config.width : window.innerWidth;
      const margin = 12;
  const curW = Math.max(80, moneyText.width + moneyHudPadding * 2);
  const curH = Math.max(28, moneyText.height + moneyHudPadding * 2);
  moneyHudContainer.x = Math.floor(gw - margin - curW);
  moneyHudContainer.y = margin + moneyHudOffsetY;
  // keep text centered in updated bg
  try { moneyText.x = Math.floor(curW / 2); moneyText.y = Math.floor(curH / 2); } catch (e) {}
  // position coin HUD under money HUD (if present)
  try {
    if (coinHudContainer) {
      coinHudContainer.x = Math.floor(gw - margin - curW);
      coinHudContainer.y = Math.floor(moneyHudContainer.y + curH + 8);
    }
  } catch (e) {}
    } catch (e) {}
  }
  positionMoneyText(scene);

  // Receipt UI (top-center) - hidden except in Maker
  createReceiptUI(scene);

  // start with a single active order; force first customer to be the villain image
  activeOrder = generateRandomOrder();
  try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
    // If this is a 5th day, ensure the first customer uses a special OTH/TVD image
    try {
      if (typeof dayNumber === 'number' && dayNumber % 5 === 0 && lastSpecialShownDay !== dayNumber && activeOrder) {
  const othKeys = ['Lucas','Nathan','Haley','Peyton','Brooke','Callisto'];
  const tvdKeys = ['Stefan','Damon','Elena','Caroline','Bonnie'];
        const specialKeys = othKeys.concat(tvdKeys).filter(Boolean);
        if (specialKeys.length > 0) {
          // force Halez.png (asset key 'Haley') on Day 35 specifically
          let pick = null;
          if (dayNumber === 35) {
            pick = 'Haley';
          } else {
            pick = specialKeys[Phaser.Math.Between(0, specialKeys.length - 1)];
          }
          if (pick) {
            try { activeOrder.appearance = activeOrder.appearance || generateRandomAppearance(); } catch (e) {}
            activeOrder.appearance.imageKey = pick;
            try { console.log('create() forced special for first spawn ->', { dayNumber, pick, activeOrderId: activeOrder && activeOrder.id }); } catch (e) {}
            lastSpecialShownDay = dayNumber;
          }
        }
      }
    } catch (e) {}
  try {
    // Only force the villain image at initial game start (day 1). If a special image was assigned
    // above (e.g., day 35), don't override it here.
    if (dayNumber === 1) {
      if (activeOrder && activeOrder.appearance) activeOrder.appearance.imageKey = 'villain';
    }
    // ensure the villain does not actually place an order: clear drinks so after dialogue she won't be served
    try {
      if (activeOrder) {
        activeOrder.drinks = [];
        activeOrder.size = null;
        activeOrder.flavor = null;
        activeOrder.toppings = [];
      }
    } catch (e) {}
  } catch (e) {}
  // Begin villain dialogue sequence (speaker-tagged lines)
  try {
  setVillainDialogue([
      { speaker: 'narration', text: 'The bell above the door jingles as Vera Chai steps into Boba Dream. The cozy warmth of the shop contrasts sharply with her cold presence. She glances around with a smirk.' },
      { speaker: 'vera', text: 'Oh, don\'t bother. I\'m not here to drink your little cups of sugar. I\'m here to make sure you understand your place.' },
  { speaker: 'narration', text: 'She reaches into her purse and pulls out a glossy, neon-infused photo, sliding it across the counter. The photo shows the BobaCorp flagship store, glowing with a bold sign.', showImage: 'BobaCorp.png' },
      { speaker: 'vera', text: 'This… this is the future. Big, flashy, profitable. And little shops like yours? You\'re nothing but a quaint distraction. You don’t stand a chance against BobaCorp.' },
      { speaker: 'you', text: 'We\'ll manage. People like real, handmade boba.' },
      { speaker: 'vera', text: 'Manage? Oh, honey… I don\'t think you understand. I can shut you down before you even get started. People will flock to my stores because they’re bigger, shinier, and better advertised. You’re… irrelevant.' },
      { speaker: 'vera', text: 'This is your last warning. Keep dreaming small, or you\'ll regret it. And don\'t think your little charm and nostalgia will save you.' },
      { speaker: 'vera', text: 'Good luck… you’re going to need it.' },
      { speaker: 'narration', text: 'With a flick of her wrist, she turns and exits, the door jingling behind her. You, taking a deep breath, staring at the door, knowing this is only the beginning.' },
  ], scene);
  try { villainDialogueOwnerImageKey = 'villain'; } catch (e) {}
  } catch (e) {}
  // ensure receipt shows the active order if maker is visible
  updateReceipt(scene, currentOrderInMaker || activeOrder);
  refreshOrdersUI(scene);
  // create shop UI
  createShopUI(scene);
  // Start directly with the Orders UI (no title screen)
  showOrdersScreen(scene);

  // Boba-specific maker label replacement removed

  // show the Menu.png overlay scaled to the game UI
  try {
    showMenuOverlay();
    // keep overlay sized to the canvas on resize
    window._boba_menu_overlay_resize = () => showMenuOverlay();
    window.addEventListener('resize', window._boba_menu_overlay_resize);
  } catch (e) {}
  // create DOM customer img resize handler so the overlay stays in the right spot
  try {
    window._boba_dom_customer_resize = () => { try { positionDomCustomerImg(this); } catch (e) {} };
    window.addEventListener('resize', window._boba_dom_customer_resize);
  } catch (e) {}

  // initialize day start money and create day overlay DOM element
  dayStartMoney = money;
  createDayOverlay();
}

// Create a simple DOM overlay for end-of-day summary
function createDayOverlay() {
  if (document.getElementById('dayOverlay')) return;
  const div = document.createElement('div');
  div.id = 'dayOverlay';
  div.style.position = 'fixed';
  div.style.left = '0';
  div.style.top = '0';
  div.style.width = '100vw';
  div.style.height = '100vh';
  div.style.display = 'none';
  div.style.zIndex = 5000;
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.background = 'rgba(0,0,0,0.55)';
  div.style.backdropFilter = 'blur(4px)';
  div.style.pointerEvents = 'auto';

  const card = document.createElement('div');
  card.style.width = '520px';
  card.style.maxWidth = '90%';
  card.style.margin = 'auto';
  card.style.background = '#fff';
  card.style.borderRadius = '12px';
  card.style.padding = '24px';
  card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
  card.style.textAlign = 'center';

  const title = document.createElement('h2');
  title.id = 'dayOverlayTitle';
  title.style.margin = '6px 0 12px 0';
  title.style.fontFamily = 'Poppins, sans-serif';
  title.style.fontSize = '22px';
  title.style.color = '#222';
  card.appendChild(title);

  const body = document.createElement('div');
  body.id = 'dayOverlayBody';
  body.style.fontFamily = 'Poppins, sans-serif';
  body.style.color = '#333';
  body.style.marginBottom = '18px';
  body.style.fontSize = '16px';
  card.appendChild(body);

  const btn = document.createElement('button');
  btn.id = 'dayOverlayNext';
  btn.textContent = 'Next Day';
  btn.style.fontFamily = 'Poppins, sans-serif';
  btn.style.padding = '10px 18px';
  btn.style.border = 'none';
  btn.style.background = '#66bb6a';
  btn.style.color = '#fff';
  btn.style.borderRadius = '8px';
  btn.style.cursor = 'pointer';
  btn.onclick = () => { try { startNextDay(window._boba_scene); } catch (e) {} };
  card.appendChild(btn);

  div.appendChild(card);
  document.body.appendChild(div);
}

// Small temporary toast used by pet actions (and other quick feedback)
function showPetToast(message, duration) {
  try {
    duration = typeof duration === 'number' ? duration : 1000;
    let wrap = document.getElementById('petToastWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'petToastWrap';
      wrap.style.position = 'fixed';
      wrap.style.right = '18px';
      wrap.style.top = '18px';
      wrap.style.zIndex = '3200';
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '8px';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'pet-toast';
    t.textContent = message;
    t.style.background = 'rgba(0,0,0,0.78)';
    t.style.color = '#fff';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '8px';
    t.style.fontFamily = 'Poppins, sans-serif';
    t.style.fontSize = '14px';
    t.style.boxShadow = '0 8px 18px rgba(0,0,0,0.35)';
    t.style.pointerEvents = 'none';
    t.style.opacity = '0';
    t.style.transition = 'opacity 200ms ease, transform 200ms ease';
    wrap.appendChild(t);
    // animate in
    requestAnimationFrame(() => { try { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; } catch (e) {} });
    setTimeout(() => {
      try { t.style.opacity = '0'; t.style.transform = 'translateY(-6px)'; } catch (e) {}
      setTimeout(() => { try { if (t && t.parentNode) t.parentNode.removeChild(t); } catch (e) {} }, 220);
    }, duration);
  } catch (e) {}
}

// Boba label replacement removed

// Collection overlay: full-screen image display for the Collection Book
function createCollectionOverlay() {
  if (document.getElementById('collectionOverlay')) return;
  const div = document.createElement('div');
  div.id = 'collectionOverlay';
  div.style.position = 'fixed';
  div.style.left = '0';
  div.style.top = '0';
  div.style.width = '100vw';
  div.style.height = '100vh';
  div.style.display = 'none';
  // place the DOM image behind the Phaser canvas so canvas UI (nav buttons) remains on top
  // Phaser canvas is set to zIndex ~2000 elsewhere, so use a lower zIndex
  // place above the Phaser canvas so thumbnails and zoom receive clicks
  div.style.zIndex = 4000;
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.background = '#000';
  // disable pointer events so clicks go through to the Phaser canvas (nav buttons remain clickable)
  // allow pointer events so thumbnails can be clicked to zoom
  div.style.pointerEvents = 'auto';

  const img = document.createElement('img');
  img.id = 'collectionOverlayImg';
  img.src = './assets/Background2.jpeg';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  img.style.objectPosition = 'center';
  img.style.pointerEvents = 'none';
  div.appendChild(img);

  // Build a centered grid of framed thumbnails for any collection character assets
  try {
  const grid = document.createElement('div');
  grid.id = 'collectionGrid';
  // position the grid centered over the background (but overlay sits behind the canvas)
  grid.style.position = 'absolute';
  // nudge grid a bit to the right
  grid.style.left = '44%';
  // center grid horizontally and nudge vertically a bit upward
  grid.style.top = '45%';
  grid.style.transform = 'translate(-50%, -50%)';
  grid.style.width = '80%';
  grid.style.maxWidth = '1200px';
  grid.style.boxSizing = 'border-box';
  // allow clicks on thumbnails
  grid.style.pointerEvents = 'auto';
  // use CSS grid so we can force two rows and compute columns dynamically
  grid.style.display = 'grid';
  // more space between rows for clearer separation
  grid.style.rowGap = '56px';
  grid.style.columnGap = '18px';
  grid.style.justifyItems = 'center';
  grid.style.alignItems = 'center';
  // add ample space beneath the grid so it doesn't crowd the bottom nav
  grid.style.paddingBottom = '120px';
  // do not allow scrolling; ensure layout fits two rows so nobody is cut off
  grid.style.maxHeight = 'none';
  grid.style.overflowY = 'visible';

    // find collection image keys (convention: keys that end with '2')
    try {
      let keys = Object.keys(CUSTOMER_ASSET_MAP || {}).filter(k => {
        const s = String(k || '');
        // exclude the generic in-game customer2 keys from collection
        if (/^customer2(_raw)?$/i.test(s)) return false;
        return /2$/.test(s);
      });
      // filter to only keys the player has collected
      try { keys = keys.filter(k => Boolean(collectedCharacters && collectedCharacters[k])); } catch (e) {}
      // If nothing collected yet, insert a placeholder message
      if (!keys || keys.length === 0) {
        try {
          const placeholder = document.createElement('div');
          placeholder.id = 'collectionPlaceholder';
          placeholder.style.position = 'absolute';
          placeholder.style.left = '50%';
          placeholder.style.top = '50%';
          placeholder.style.transform = 'translate(-50%, -50%)';
          placeholder.style.color = '#fff';
          placeholder.style.font = 'bold 20px Poppins, sans-serif';
          placeholder.style.textAlign = 'center';
          placeholder.style.pointerEvents = 'none';
          placeholder.textContent = 'No characters collected yet. Meet customers to unlock photos.';
          div.appendChild(placeholder);
        } catch (e) {}
      }
      try {
        // Ensure Penelope2 and Callisto2 occupy the same column (Callisto below Penelope)
        const penIdx = keys.indexOf('Penelope2');
        const callIdx = keys.indexOf('Callisto2');
        if (penIdx !== -1 && callIdx !== -1) {
          // remove Callisto2 from its current position
          keys = keys.filter(k => k !== 'Callisto2');
          // recompute columns based on the new length (two rows desired)
          const cols = Math.max(1, Math.ceil((keys.length || 0) / 2));
          // target position directly below Penelope2
          const target = Math.min(keys.length, penIdx + cols);
          keys.splice(target, 0, 'Callisto2');
        }
      } catch (e) {}
      try {
        // Swap Haley2 and Penelope2 positions if both present
        const hIdx = keys.indexOf('Haley2');
        const pIdx = keys.indexOf('Penelope2');
        if (hIdx !== -1 && pIdx !== -1) {
          const tmp = keys[hIdx];
          keys[hIdx] = keys[pIdx];
          keys[pIdx] = tmp;
        }
      } catch (e) {}
  // compute columns so items form two rows (no scrolling)
  const cols = Math.max(1, Math.ceil((keys.length || 0) / 2));
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = 'auto auto';
      keys.forEach(k => {
        try {
          // Use the map directly for Penelope2 and Callisto2 to avoid accidental swaps
          let fname = CUSTOMER_ASSET_MAP[k];
          try {
            if (k === 'Penelope2') {
              fname = CUSTOMER_ASSET_MAP['Penelope2'];
            } else if (k === 'Callisto2') {
              fname = CUSTOMER_ASSET_MAP['Callisto2'];
            }
          } catch (e) {}
          if (!fname) return;
          const frame = document.createElement('div');
          frame.className = 'collection-frame';
          // keep picture sizing generous; make the decorative border thinner
          frame.style.width = '160px';
          frame.style.height = '200px';
          frame.style.display = 'flex';
          frame.style.alignItems = 'center';
          frame.style.justifyContent = 'center';
          frame.style.background = '#fff';
          frame.style.borderRadius = '12px';
          frame.style.boxShadow = '0 12px 30px rgba(0,0,0,0.35)';
          // skinnier uniform border
          frame.style.borderWidth = '3px';
          frame.style.borderStyle = 'solid';
          frame.style.borderColor = '#f8f4f0';
          // ensure border counts inside frame dimensions for consistent sizing
          frame.style.boxSizing = 'border-box';
          frame.style.overflow = 'hidden';
          // allow the frame and its child thumbnail to receive pointer events
          frame.style.pointerEvents = 'auto';

          const thumb = document.createElement('img');
          thumb.src = './assets/' + fname;
          thumb.alt = k;
          // let the thumbnail occupy most of the frame so reducing the border
          // doesn't shrink the visible picture
          thumb.style.maxWidth = '94%';
          thumb.style.maxHeight = '94%';
          thumb.style.objectFit = 'contain';
          // allow interaction and show a pointer cursor
          thumb.style.pointerEvents = 'auto';
          thumb.style.cursor = 'pointer';
          // clicking the thumbnail opens a fullscreen zoom; clicking the zoom closes it
          thumb.addEventListener('click', (ev) => {
            try {
              ev.stopPropagation();
              // if a zoom overlay already exists, remove it (toggle behavior)
              const existing = document.getElementById('collectionZoomWrap');
              if (existing) {
                try { existing.remove(); } catch (e) {}
                return;
              }
              const zw = document.createElement('div');
              zw.id = 'collectionZoomWrap';
              zw.style.position = 'fixed';
              zw.style.left = '0';
              zw.style.top = '0';
              zw.style.width = '100vw';
              zw.style.height = '100vh';
              zw.style.display = 'flex';
              zw.style.justifyContent = 'center';
              zw.style.alignItems = 'center';
              zw.style.background = 'rgba(0,0,0,0.78)';
              // ensure zoom sits above everything (canvas zIndex ~2000)
              zw.style.zIndex = '5000';
              zw.style.cursor = 'pointer';
              const big = document.createElement('img');
              big.src = thumb.src;
              big.alt = thumb.alt || '';
              big.style.maxWidth = '90%';
              big.style.maxHeight = '90%';
              big.style.objectFit = 'contain';
              big.style.border = '6px solid rgba(255,255,255,0.92)';
              big.style.borderRadius = '12px';
              big.style.boxShadow = '0 12px 40px rgba(0,0,0,0.6)';
              zw.appendChild(big);
              // clicking the zoom wrapper closes it
              zw.addEventListener('click', () => { try { zw.remove(); } catch (e) {} });
              document.body.appendChild(zw);
            } catch (e) {}
          });
          frame.appendChild(thumb);
          grid.appendChild(frame);
        } catch (e) {}
      });
    } catch (e) {}

    div.appendChild(grid);
  } catch (e) {}

  // do not intercept clicks; closing is handled by navigation or hideCollectionScreen()
  document.body.appendChild(div);
}

function showCollectionScreen(scene) {
  try {
    currentScreen = 'collection';
    createCollectionOverlay();
    const el = document.getElementById('collectionOverlay');
    if (!el) return;
    // show only the collection background
    el.style.display = 'flex';
  // create and show DOM nav so buttons remain above the overlay and clickable
  try { createDomNavButtons(); const nav = document.getElementById('domNavWrap'); if (nav) nav.style.display = 'flex'; } catch (e) {}
    // hide in-canvas UI elements so nothing shows over the background
    try { if (ordersContainer) ordersContainer.setVisible(false); } catch (e) {}
    try { if (shopContainer) shopContainer.setVisible(false); } catch (e) {}
    try { if (uiGroup) uiGroup.getChildren().forEach(ch => ch.setVisible(false)); } catch (e) {}
    try { if (cupSprites && cupSprites.container) cupSprites.container.setVisible(false); } catch (e) {}
    try { if (cupSprites && cupSprites.infoText) cupSprites.infoText.setVisible(false); } catch (e) {}
    try { if (receiptContainer) receiptContainer.setVisible(false); } catch (e) {}
    try { if (moneyHudContainer) moneyHudContainer.setVisible(false); } catch (e) {}
    try { if (dayContainer) dayContainer.setVisible(false); } catch (e) {}
    try { if (globalActionsContainer) globalActionsContainer.setVisible(false); } catch (e) {}
    // pause any active dialogues (do not fully stop them) and hide DOM customer avatar
    try {
      if (villainTalking) {
        collectionPausedDialogue = true;
        // hide dialog overlays but keep state so it can resume
        try {
          const wrap = document.getElementById('dialogImageOverlayWrap') || document.getElementById('dialogVideoOverlayWrap');
          if (wrap) wrap.style.display = 'none';
        } catch (e) {}
      } else {
        collectionPausedDialogue = false;
      }
    } catch (e) {}
    try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
    // prevent new customers or interactions while viewing the collection
    try { customersEnabled = false; } catch (e) {}
  // Hide/remove any DOM overlays or badge wrappers that could sit above the Collection UI
  try { const p = document.getElementById('persistentImageOverlay'); if (p) p.style.display = 'none'; } catch (e) {}
  try { const p2 = document.getElementById('plainImageOverlay'); if (p2) p2.style.display = 'none'; } catch (e) {}
  try { const w1 = document.getElementById('ordersOthuWrap'); if (w1) w1.style.display = 'none'; } catch (e) {}
  try { const w2 = document.getElementById('ordersTvduWrap'); if (w2) w2.style.display = 'none'; } catch (e) {}
  try { const w3 = document.getElementById('ordersVddWrap'); if (w3) w3.style.display = 'none'; } catch (e) {}
  // ensure TVDU and VDD visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.tvduImage) ordersContainer.tvduImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(false); } catch (e) {}
  try { const td = ordersContainer && ordersContainer._tvduDom; if (td) td.style.display = 'none'; } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddImage) ordersContainer.vddImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(false); } catch (e) {}
  try { const vd = ordersContainer && ordersContainer._vddDom; if (vd) vd.style.display = 'none'; } catch (e) {}
  // keep navigation buttons clickable (they are separate objects not hidden here)
  } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function showPetScreen(scene) {
  try {
    currentScreen = 'pet';
    // ensure any collection overlay is hidden
    try { hideCollectionScreen(); } catch (e) {}
    // create and show a pet overlay (behind the canvas) using Pic.jpeg
    try { createPetOverlay(); } catch (e) {}
    try {
      const el = document.getElementById('petOverlay');
      if (el) el.style.display = 'flex';
      // hide in-canvas UI elements so the pet background is visible
      try { if (ordersContainer) ordersContainer.setVisible(false); } catch (e) {}
      try { if (shopContainer) shopContainer.setVisible(false); } catch (e) {}
      try { if (uiGroup) uiGroup.getChildren().forEach(ch => ch.setVisible(false)); } catch (e) {}
      try { if (cupSprites && cupSprites.container) cupSprites.container.setVisible(false); } catch (e) {}
      try { if (cupSprites && cupSprites.infoText) cupSprites.infoText.setVisible(false); } catch (e) {}
      try { if (receiptContainer) receiptContainer.setVisible(false); } catch (e) {}
      try { if (moneyHudContainer) moneyHudContainer.setVisible(false); } catch (e) {}
      try { if (dayContainer) dayContainer.setVisible(false); } catch (e) {}
      try { if (globalActionsContainer) globalActionsContainer.setVisible(false); } catch (e) {}
      // pause any active dialogues (do not fully stop them) and hide DOM customer avatar
      try {
        if (villainTalking) {
          collectionPausedDialogue = true;
          try {
            const wrap = document.getElementById('dialogImageOverlayWrap') || document.getElementById('dialogVideoOverlayWrap');
            if (wrap) wrap.style.display = 'none';
          } catch (e) {}
        } else {
          collectionPausedDialogue = false;
        }
      } catch (e) {}
      try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
      // prevent new customers or interactions while viewing the pet screen
      try { customersEnabled = false; } catch (e) {}
  // ensure OTHU visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.othuImage && !(window && window._orders_othu_persistent)) ordersContainer.othuImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(false); } catch (e) {}
  try { const od = ordersContainer && ordersContainer._othuDom; if (od && !(window && window._orders_othu_persistent)) od.style.display = 'none'; } catch (e) {}
  // ensure TVDU and VDD visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.tvduImage && !(window && window._orders_tvdu_persistent)) ordersContainer.tvduImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(false); } catch (e) {}
  try { const td = ordersContainer && ordersContainer._tvduDom; if (td && !(window && window._orders_tvdu_persistent)) td.style.display = 'none'; } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddImage) ordersContainer.vddImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(false); } catch (e) {}
  try { const vd = ordersContainer && ordersContainer._vddDom; if (vd && !(window && window._orders_vdd_persistent)) vd.style.display = 'none'; } catch (e) {}
  // ensure TVDU and VDD visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.tvduImage && !(window && window._orders_tvdu_persistent)) ordersContainer.tvduImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.tvduFrame) ordersContainer.tvduFrame.setVisible(false); } catch (e) {}
  try { const td = ordersContainer && ordersContainer._tvduDom; if (td && !(window && window._orders_tvdu_persistent)) td.style.display = 'none'; } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddImage && !(window && window._orders_vdd_persistent)) ordersContainer.vddImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.vddFrame) ordersContainer.vddFrame.setVisible(false); } catch (e) {}
  try { const vd = ordersContainer && ordersContainer._vddDom; if (vd && !(window && window._orders_vdd_persistent)) vd.style.display = 'none'; } catch (e) {}
    } catch (e) {}

    // play hus.mp4 using the dialog video overlay helper (kept after overlay show so audio/video focus is correct)
    try { showDialogVideo('hus.mp4', () => { /* video finished */ }); } catch (e) {}
  } catch (e) {}
    try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

// Pet overlay: full-screen image display for the Pet UI (uses Pic.jpeg)
function createPetOverlay() {
  if (document.getElementById('petOverlay')) return;
  const div = document.createElement('div');
  div.id = 'petOverlay';
  div.style.position = 'fixed';
  div.style.left = '0';
  div.style.top = '0';
  div.style.width = '100vw';
  div.style.height = '100vh';
  div.style.display = 'none';
  // place behind the Phaser canvas so canvas UI remains on top
  div.style.zIndex = 1200;
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.background = '#000';
  div.style.pointerEvents = 'none';

  const img = document.createElement('img');
  img.id = 'petOverlayImg';
  img.src = './assets/Pic.jpeg';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  img.style.objectPosition = 'center';
  img.style.pointerEvents = 'none';
  div.appendChild(img);
  // Add left-middle action buttons (Play / Feed)
  try {
    // allow overlay to receive pointer events for its buttons
    div.style.pointerEvents = 'auto';
    // container for the left-side buttons
    const btnWrap = document.createElement('div');
    btnWrap.id = 'petActionButtons';
    btnWrap.style.position = 'fixed';
    btnWrap.style.left = '18px';
    btnWrap.style.top = '50%';
    btnWrap.style.transform = 'translateY(-50%)';
    btnWrap.style.display = 'flex';
    btnWrap.style.flexDirection = 'column';
    btnWrap.style.gap = '12px';
    btnWrap.style.zIndex = '2600';
    btnWrap.style.pointerEvents = 'auto';

    const makeBtn = (label, bg, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.fontFamily = 'Poppins, sans-serif';
      b.style.padding = '10px 14px';
      b.style.border = 'none';
      b.style.borderRadius = '8px';
      b.style.cursor = 'pointer';
      b.style.background = bg;
      b.style.color = '#fff';
      b.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
      b.style.pointerEvents = 'auto';
      b.onclick = onClick;
      return b;
    };

    // Play action: costs 1 coin
    const playBtn = makeBtn('Play', '#5daee8', () => {});
    const playWrap = document.createElement('div');
    playWrap.style.display = 'flex';
    playWrap.style.alignItems = 'center';
    playWrap.style.gap = '8px';
    playWrap.style.pointerEvents = 'auto';
    const playCostLbl = document.createElement('div');
    playCostLbl.textContent = '-1 coin';
    playCostLbl.style.fontFamily = 'Poppins, sans-serif';
    playCostLbl.style.fontSize = '13px';
    playCostLbl.style.color = '#fff';
    playCostLbl.style.opacity = '0.95';
    playWrap.appendChild(playBtn);
    playWrap.appendChild(playCostLbl);
    playBtn.onclick = () => {
      try {
        if (!(typeof coins === 'number') || coins < 1) { showPetToast('Need 1 coin to play', 900); return; }
        coins = coins - 1; try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {} try { window._coins = coins; } catch (e) {}
        // pulse the pet image and apply effects
        const petImg = document.getElementById('petOverlayImg');
        if (petImg) { petImg.style.transition = 'transform 260ms ease-out'; petImg.style.transform = 'scale(1.08)'; setTimeout(() => { try { petImg.style.transform = 'scale(1)'; } catch (e) {} }, 260); }
        try { petBoredom = Math.min(100, (typeof petBoredom === 'number') ? petBoredom + 40 : 100); } catch (e) {}
        try { petHunger = Math.max(0, (typeof petHunger === 'number') ? petHunger - 8 : 0); } catch (e) {}
        try { updatePetOverlayStats(); } catch (e) {}
        showPetToast('Playing!', 900);
        try { showDialogVideo('Play1.mp4', () => {}); } catch (e) {}
        try { setTimeout(() => { try { const v = document.getElementById('dialogVideoOverlay'); if (v) { v.muted = false; v.play().catch(() => {}); } } catch (e) {} }, 60); } catch (e) {}
      } catch (e) {}
    };

    // Feed action: costs 1 coin
    const feedBtn = makeBtn('Feed', '#f2a6d9', () => {});
    const feedWrap = document.createElement('div');
    feedWrap.style.display = 'flex';
    feedWrap.style.alignItems = 'center';
    feedWrap.style.gap = '8px';
    feedWrap.style.pointerEvents = 'auto';
    const feedCostLbl = document.createElement('div');
    feedCostLbl.textContent = '-1 coin';
    feedCostLbl.style.fontFamily = 'Poppins, sans-serif';
    feedCostLbl.style.fontSize = '13px';
    feedCostLbl.style.color = '#fff';
    feedCostLbl.style.opacity = '0.95';
    feedWrap.appendChild(feedBtn);
    feedWrap.appendChild(feedCostLbl);
    feedBtn.onclick = () => {
      try {
        if (!(typeof coins === 'number') || coins < 1) { showPetToast('Need 1 coin to feed', 900); return; }
        coins = coins - 1; try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {} try { window._coins = coins; } catch (e) {}
        window._pet_happiness = (window._pet_happiness || 0) + 1;
        try { if (typeof money === 'number') { money = (typeof money === 'number') ? money + 1 : 1; if (window._boba_scene && typeof updateMoneyText === 'function') updateMoneyText(window._boba_scene); } } catch (e) {}
        try { petHunger = Math.min(100, (typeof petHunger === 'number') ? petHunger + 48 : 100); } catch (e) {}
        try { petBoredom = Math.min(100, (typeof petBoredom === 'number') ? petBoredom + 12 : 100); } catch (e) {}
        try { updatePetOverlayStats(); } catch (e) {}
        showPetToast('Feeding... +$1', 900);
        try { showDialogVideo('Feeding.mp4', () => {}); } catch (e) {}
        try { setTimeout(() => { try { const v = document.getElementById('dialogVideoOverlay'); if (v) { v.muted = false; v.play().catch(() => {}); } } catch (e) {} }, 60); } catch (e) {}
      } catch (e) {}
    };

    btnWrap.appendChild(playWrap);
    btnWrap.appendChild(feedWrap);
    // Create a small stats panel on the right to show Hunger and Boredom
    try {
      const statsWrap = document.createElement('div');
      statsWrap.id = 'petStatsWrap';
      statsWrap.style.position = 'fixed';
      statsWrap.style.right = '18px';
      statsWrap.style.top = '18px';
      statsWrap.style.width = '220px';
      statsWrap.style.zIndex = '2600';
      statsWrap.style.pointerEvents = 'none';
      statsWrap.style.color = '#fff';
      statsWrap.style.fontFamily = 'Poppins, sans-serif';

      const makeBar = (label) => {
        const row = document.createElement('div');
        row.style.marginBottom = '10px';
        const lab = document.createElement('div');
        lab.textContent = label;
        lab.style.fontSize = '13px';
        lab.style.marginBottom = '6px';
        const outer = document.createElement('div');
        outer.style.width = '100%';
        outer.style.height = '14px';
        outer.style.background = 'rgba(0,0,0,0.35)';
        outer.style.borderRadius = '8px';
        const inner = document.createElement('div');
        inner.style.height = '100%';
        inner.style.width = '100%';
        inner.style.borderRadius = '8px';
        inner.style.transition = 'width 300ms ease';
        outer.appendChild(inner);
        row.appendChild(lab);
        row.appendChild(outer);
        return { row, inner };
      };

      const hunger = makeBar('Hunger');
      hunger.inner.style.background = '#ffb86b';
      const bored = makeBar('Boredom');
      bored.inner.style.background = '#5daee8';
  statsWrap.appendChild(hunger.row);
  statsWrap.appendChild(bored.row);
  // attach stats into the pet overlay so they only appear while the Pet UI is visible
  try { div.appendChild(statsWrap); } catch (e) { document.body.appendChild(statsWrap); }
      // expose inner nodes for updates
      try { window._pet_stats_nodes = { hungerInner: hunger.inner, boredInner: bored.inner }; } catch (e) {}
      // initial sync
      try { updatePetOverlayStats(); } catch (e) {}
    } catch (e) {}
    // ensure the buttons are appended to body so they sit above the canvas
    document.body.appendChild(btnWrap);
  } catch (e) {}
  document.body.appendChild(div);
}

function hidePetScreen() {
  try {
    const el = document.getElementById('petOverlay');
    if (el) el.style.display = 'none';
  // remove left-side pet action buttons if present
  try { const b = document.getElementById('petActionButtons'); if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) {}
  // remove pet stats panel if present (ensure hunger/boredom UI isn't left behind)
  try { const s = document.getElementById('petStatsWrap'); if (s && s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
  // clear exposed pet stat nodes and values so other UIs don't read them
  try { if (typeof window !== 'undefined') { delete window._pet_stats_nodes; delete window._pet_hunger; delete window._pet_boredom; } } catch (e) {}
  try { const nav = document.getElementById('domNavWrap'); if (nav && nav.parentNode) nav.parentNode.removeChild(nav); } catch (e) {}
    try { if (dayContainer) dayContainer.setVisible(true); } catch (e) {}
    try { if (globalActionsContainer) globalActionsContainer.setVisible(true); } catch (e) {}
    try { if (uiGroup) uiGroup.getChildren().forEach(ch => ch.setVisible(true)); } catch (e) {}
    try { if (moneyHudContainer) moneyHudContainer.setVisible(true); } catch (e) {}
    try { if (receiptContainer) receiptContainer.setVisible(true); } catch (e) {}
    try { if (cupSprites && cupSprites.container) cupSprites.container.setVisible(true); } catch (e) {}
    try { customersEnabled = true; } catch (e) {}
    try {
      if (collectionPausedDialogue && villainTalking) {
        collectionPausedDialogue = false;
        try { refreshOrdersUI(window._boba_scene || null); } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
}

// Update the visual bars in the Pet overlay (if present)
function updatePetOverlayStats() {
  try {
    // clamp values
    petHunger = Math.max(0, Math.min(100, Number(petHunger) || 0));
    petBoredom = Math.max(0, Math.min(100, Number(petBoredom) || 0));
    if (window && window._pet_stats_nodes) {
      try {
        const hi = window._pet_stats_nodes.hungerInner;
        const bi = window._pet_stats_nodes.boredInner;
        if (hi) hi.style.width = (petHunger) + '%';
        if (bi) bi.style.width = (petBoredom) + '%';
      } catch (e) {}
    }
    // persist to window for debugging/persistence across quick reloads
    try { if (typeof window !== 'undefined') { window._pet_hunger = petHunger; window._pet_boredom = petBoredom; } } catch (e) {}
  } catch (e) {}
}


function hideCollectionScreen() {
  try {
    const el = document.getElementById('collectionOverlay');
    if (el) el.style.display = 'none';
  try { const nav = document.getElementById('domNavWrap'); if (nav && nav.parentNode) nav.parentNode.removeChild(nav); } catch (e) {}
  try { if (dayContainer) dayContainer.setVisible(true); } catch (e) {}
  try { if (globalActionsContainer) globalActionsContainer.setVisible(true); } catch (e) {}
  try { if (uiGroup) uiGroup.getChildren().forEach(ch => ch.setVisible(true)); } catch (e) {}
  try { if (moneyHudContainer) moneyHudContainer.setVisible(true); } catch (e) {}
  try { if (receiptContainer) receiptContainer.setVisible(true); } catch (e) {}
  try { if (cupSprites && cupSprites.container) cupSprites.container.setVisible(true); } catch (e) {}
  // allow customers/dialogue to continue; callers (showShop/Make/Orders) will set the appropriate screen visibility
  try { customersEnabled = true; } catch (e) {}
  // if dialogue was paused when entering the collection, restore visual overlays and refresh UI
  try {
    if (collectionPausedDialogue && villainTalking) {
      collectionPausedDialogue = false;
      try { refreshOrdersUI(window._boba_scene || null); } catch (e) {}
    }
  } catch (e) {}
  } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function showDayOver(scene) {
  try {
    const el = document.getElementById('dayOverlay');
    if (!el) return;
    const title = document.getElementById('dayOverlayTitle');
    const body = document.getElementById('dayOverlayBody');
    const earned = money - dayStartMoney;
    if (title) title.textContent = `Day ${dayNumber} Complete`;
    if (body) body.innerHTML = `<div style="font-size:18px;margin-bottom:6px;">You served ${dayServedCount} customers today.</div><div style="font-size:16px;">Day earnings: <strong>$${earned}</strong></div><div style="font-size:14px;color:#666;margin-top:8px;">Total money: $${money}</div>`;
    el.style.display = 'flex';
    // hide DOM customer avatar while overlay is up
    try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
    // temporarily disable customers
    customersEnabled = false;
  } catch (e) {}
}

function hideDayOver() {
  try {
    const el = document.getElementById('dayOverlay');
    if (el) el.style.display = 'none';
    // restore DOM customer if Orders is active
    try { const d = document.getElementById('domCustomerImg'); if (d && currentScreen === 'orders') d.style.display = 'block'; } catch (e) {}
  } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function startNextDay(scene) {
  try {
    hideDayOver();
    dayNumber = (typeof dayNumber === 'number') ? dayNumber + 1 : 1;
    dayServedCount = 0;
    dayStartMoney = money;
    // re-enable customers and spawn a new one
    customersEnabled = true;
  activeOrder = generateRandomOrder();
  try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
    refreshOrdersUI(scene);
    // update HUD day text
  try { if (dayText) dayText.setText(`Day ${dayNumber}`); refreshDayContainer(); } catch (e) {}
    // show Orders screen so player can continue
    showOrdersScreen(scene);
    // Decay pet stats slightly each new day
    try {
      petHunger = Math.max(0, (typeof petHunger === 'number') ? petHunger - 8 : 0);
      petBoredom = Math.max(0, (typeof petBoredom === 'number') ? petBoredom - 6 : 0);
      try { updatePetOverlayStats(); } catch (e) {}
    } catch (e) {}
  } catch (e) {}
}

  // helper to refresh the dayContainer bg to match text width
  function refreshDayContainer() {
    try {
      if (!dayContainer || !dayContainer.bg || !dayText) return;
      const padding = 12;
      const w = Math.max(88, dayText.width + padding * 2);
      const h = Math.max(36, dayText.height + padding);
      dayContainer.bg.clear();
      dayContainer.bg.fillStyle(0xfffbdb, 1);
      dayContainer.bg.fillRoundedRect(0, 0, w, h, 8);
      dayContainer.bg.lineStyle(2, 0xf0d88a, 1);
      dayContainer.bg.strokeRoundedRect(0, 0, w, h, 8);
      // store for layout use
      dayContainer.bg.__width = w;
      dayContainer.bg.__height = h;
      // vertically center text
      dayText.x = 12;
      dayText.y = Math.floor((h - dayText.height) / 2);
    } catch (e) {}
  }

// Size the #menuOverlay element to match the Phaser canvas area while preserving aspect
function sizeMenuOverlay(scene) {
  try {
  const el = document.getElementById('menuOverlay');
  if (!el) return;
  // full-screen fixed overlay
  el.style.position = 'fixed';
  // fill the viewport and crop from the bottom if needed: keep the top visible
  el.style.top = '0px';
  el.style.left = '0px';
  el.style.width = '100vw';
  el.style.height = '100vh';
  el.style.objectFit = 'cover';
  el.style.objectPosition = 'center top';
  el.style.display = 'block';
  } catch (e) {}
}

function showMenuOverlay() {
  try {
  sizeMenuOverlay();
  const btn = document.getElementById('menuPlayBtn');
  const t = document.getElementById('menuTitle');
  if (btn) btn.style.display = 'block';
  if (t) t.style.display = 'block';
  if (btn) btn.onclick = () => {
    try { hideMenuOverlay(); } catch (e) {}
    // ensure scene reference exists and Orders UI is visible, then animate the current customer
    try {
      setTimeout(() => {
        try {
          if (window._boba_scene) {
            // show orders screen so avatar is visible
            try { showOrdersScreen(window._boba_scene); } catch (e) {}
            // play the appearance animation for the active customer (villain first)
            try { animateCustomerAppearance(window._boba_scene); } catch (e) {}
          }
        } catch (e) {}
      }, 80);
    } catch (e) {}
  };
  // ensure the DOM customer image is hidden while the title overlay is visible
  try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
  // hide the in-canvas day tracker while the title/menu overlay is visible
  try { if (typeof dayContainer !== 'undefined' && dayContainer) dayContainer.setVisible(false); } catch (e) {}
  // hide persistent global actions while menu is visible
  try { if (globalActionsContainer) globalActionsContainer.setVisible(false); } catch (e) {}
  } catch (e) {}
}

function hideMenuOverlay() {
  try {
    const el = document.getElementById('menuOverlay');
    if (el) el.style.display = 'none';
  const btn = document.getElementById('menuPlayBtn');
  if (btn) btn.style.display = 'none';
  const t = document.getElementById('menuTitle');
  if (t) t.style.display = 'none';
  if (window._boba_menu_overlay_resize) { window.removeEventListener('resize', window._boba_menu_overlay_resize); window._boba_menu_overlay_resize = null; }
  // restore DOM customer image if Orders screen is active
  try {
    const d = document.getElementById('domCustomerImg');
    if (d && window._boba_scene && (typeof currentScreen !== 'undefined') && currentScreen === 'orders') {
      positionDomCustomerImg(window._boba_scene);
      d.style.display = 'block';
    }
  } catch (e) {}
  // restore the day tracker now that the title/menu overlay is hidden
  try { if (typeof dayContainer !== 'undefined' && dayContainer) dayContainer.setVisible(true); } catch (e) {}
  // restore global actions
  try { if (globalActionsContainer) globalActionsContainer.setVisible(true); } catch (e) {}
  } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}



function update() {
  // No continuous updates needed for this simple game
}

function selectSize(scene, size) {
  selectedSize = size;
  drawCup(scene);
}

function selectFlavor(scene, flavor) {
  selectedFlavor = flavor;
  // start a fill animation when flavor is selected
  if (cupSprites.fillTween) {
    cupSprites.fillTween.stop();
    cupSprites.fillTween = null;
  }
  cupSprites.fillProgress = 0;
  // tween a numeric counter and redraw the cup on each update to simulate filling
  cupSprites.fillTween = scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 700,
    ease: 'Cubic.easeOut',
    onUpdate: (tween) => {
      cupSprites.fillProgress = tween.getValue();
      drawCup(scene);
    },
    onComplete: () => {
      cupSprites.fillProgress = 1;
      cupSprites.fillTween = null;
      drawCup(scene);
    }
  });
  drawCup(scene);
}

function addTopping(scene, topping) {
  // Place toppings in neat rows at the bottom band of the cup, similar to Boba layout.
  try {
    if (!selectedFlavor) return; // require a flavor selected
    // Remove any existing instances of the same topping to ensure a clean replacement
    for (let i = toppings.length - 1; i >= 0; i--) {
      if (toppings[i] && toppings[i].key === topping.key) toppings.splice(i, 1);
    }

    // Desired counts per topping type (how many pearls/cubes to lay out)
    const counts = { 'Boba': 8, 'Mochi': 6, 'Pudding': 4, 'Jelly': 6 };
    let total = counts[topping.key] || 6;
    // Force exact 6 for Popping Boba as requested
    if (topping.key === 'Popping Boba') total = 6;

    // compute cup geometry matching drawCup so placements align
    const size = selectedSize || { radius: 80 };
    const cupRadius = size.radius;
    const cupWidth = cupRadius * 1.6;
    const cupHeight = cupRadius * 2.0;

    // inner bottom width where toppings sit
    const bottomW = Math.max(40, Math.floor(cupWidth * 0.6));
    const innerBottomW = Math.max(12, bottomW);
    const left = -innerBottomW / 2 + 8;
    const right = innerBottomW / 2 - 8;

    // compute vertical band (liquid bottom area) same as drawCup bottom band
    const liquidBottom = Math.floor(cupHeight / 2);
    const liquidTop = -cupHeight / 2 + 26;
    const baseLiquidHeight = Math.max(8, Math.floor(liquidBottom - liquidTop));
    const topBand = liquidBottom - Math.min(48, Math.floor(baseLiquidHeight * 0.22));
    const bottomBand = liquidBottom - 2;

    // spacing based on visual pearl radius so rows align with boba size
    const pearlR = Math.max(6, Math.floor(cupRadius * 0.07));
    const pad = Math.max(4, Math.floor(pearlR * 0.5));

    // decide number of columns that fit comfortably
    const availableW = (right - left) - pad * 2;
    const colSpacing = Math.max(pearlR * 2.2, pearlR + 8);
    const maxCols = Math.max(1, Math.floor(availableW / colSpacing));

    // allow per-topping preferred column counts for specific layouts
    const preferredCols = {
      'Popping Boba': 3
    };

    // compute rows needed and the starting Y for the bottom-most row
    let cols = Math.min(maxCols, total);
    if (preferredCols[topping.key]) {
      cols = Math.min(maxCols, Math.min(preferredCols[topping.key], total));
    }
    const rows = Math.ceil(total / cols);
    const bottomRowY = bottomBand - pad - pearlR; // bottom-most row Y
    const rowGap = Math.max(pearlR + 6, Math.floor(pearlR * 1.6));

    // place each topping into grid slots left->right, bottom->up
    const startIndex = toppings.length;
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const y = bottomRowY - row * rowGap;
      // center the row horizontally
      const itemsInRow = (row === rows - 1) ? ((total - row * cols) || cols) : cols;
      const span = Math.max(1, itemsInRow - 1);
      const rowLeft = left + pad;
      const rowRight = right - pad;
      const x = (span === 0) ? Math.floor((rowLeft + rowRight) / 2) : Math.floor(rowLeft + (rowRight - rowLeft) * (col / span));
      const t = { ...topping, id: Phaser.Utils.String.UUID() + '-' + i, _x: x, _y: Math.floor(y), _placed: false };
      toppings.push(t);
    }

    // clamp any newly-added toppings to the valid txArea so they always spawn inside the cup
    try {
      const endIndex = toppings.length;
      for (let i = startIndex; i < endIndex; i++) {
        const tt = toppings[i];
        if (!tt) continue;
        const padLocal = Math.max(4, Math.floor((tt && tt._r) || pearlR));
        if (typeof tt._x === 'number') tt._x = Phaser.Math.Clamp(tt._x, left + padLocal, right - padLocal);
        if (typeof tt._y === 'number') tt._y = Phaser.Math.Clamp(tt._y, topBand + padLocal, bottomBand - padLocal);
      }
    } catch (e) {}

  } catch (e) {
    // fallback: simple single placement if anything fails
    const t = { ...topping, id: Phaser.Utils.String.UUID(), _placed: false };
    toppings.push(t);
  }
  drawCup(scene);
}

// Add a flavor button to the Maker UI dynamically (used when buying from shop)
function addFlavorToMaker(scene, item, index) {
  if (!makerFlavorsContent) return;
  const slotH = 48;
  const localY = index * slotH + Math.floor(slotH / 2);
  const btn = scene.add.rectangle(110, localY, 200, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b).setOrigin(0.5,0.5);
  const label = scene.add.text(12, localY - 8, item.key, { font: 'bold 14px Poppins', fill: '#3b2b2b' });
  btn.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => selectFlavor(scene, item))
    .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
    .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
  makerFlavorsContent.add(btn);
  makerFlavorsContent.add(label);
  // refresh max scroll
  makerFlavorsContent._maxScroll = Math.max(0, ownedFlavors.length * slotH - makerFlavorsContent._visibleHeight);
}

// Add a topping button to the Maker UI dynamically (used when buying from shop)
function addToppingToMaker(scene, item, index) {
  if (!makerToppingsContent) return;
  const slotH = 48;
  const localY = index * slotH + Math.floor(slotH / 2);
  const btn = scene.add.rectangle(90, localY, 160, 36, 0xffffff).setStrokeStyle(2, 0x9b7b7b).setOrigin(0.5,0.5);
  const label = scene.add.text(12, localY - 8, item.key, { font: 'bold 14px Poppins', fill: '#3b2b3b' });
  btn.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => addTopping(scene, item))
    .on('pointerover', () => scene.tweens.add({ targets: btn, scale: 1.03, duration: 120 }))
    .on('pointerout', () => scene.tweens.add({ targets: btn, scale: 1.0, duration: 120 }));
  makerToppingsContent.add(btn);
  try { makerToppingsContent.add(label); } catch (e) {}
  makerToppingsContent._maxScroll = Math.max(0, ownedToppings.length * slotH - makerToppingsContent._visibleHeight);
}

// Refresh Maker UI lists to reflect the current ownedFlavors and ownedToppings
function updateMakerUI(scene) {
  try {
    if (!scene) scene = window._boba_scene;
    // Update flavors
    if (makerFlavorsContent && Array.isArray(ownedFlavors)) {
      // collect displayed flavor keys (text children)
      const displayed = new Set();
      try {
        (makerFlavorsContent.list || []).forEach(ch => {
          try { if (ch && ch.type === 'Text' && typeof ch.text === 'string') displayed.add(ch.text); } catch (e) {}
        });
      } catch (e) {}
      // determine how many flavor slots are already present (text labels count as one per slot)
      let nextFlavorIndex = 0;
      try {
        // count existing flavor labels to infer next index
        const labels = (makerFlavorsContent.list || []).filter(ch => ch && ch.type === 'Text');
        nextFlavorIndex = labels.length;
      } catch (e) { nextFlavorIndex = (makerFlavorsContent._displayedCount || 0); }
      // append any owned flavors not yet displayed (preserve existing ones)
      ownedFlavors.forEach((f) => {
        try {
          const key = (f && f.key) ? f.key : String(f);
          if (!displayed.has(key)) {
            addFlavorToMaker(scene, f, nextFlavorIndex);
            nextFlavorIndex += 1;
          }
        } catch (e) {}
      });
    }
    // Update toppings
    if (makerToppingsContent && Array.isArray(ownedToppings)) {
      const displayedT = new Set();
      try {
        (makerToppingsContent.list || []).forEach(ch => {
          try { if (ch && ch.type === 'Text' && typeof ch.text === 'string') displayedT.add(ch.text); } catch (e) {}
        });
      } catch (e) {}
      // compute next topping index based on existing Text children
      let nextToppingIndex = 0;
      try {
        const tlabels = (makerToppingsContent.list || []).filter(ch => ch && ch.type === 'Text');
        nextToppingIndex = tlabels.length;
      } catch (e) { nextToppingIndex = (makerToppingsContent._displayedCount || 0); }
      ownedToppings.forEach((t) => {
        try {
          const key = (t && t.key) ? t.key : String(t);
          if (!displayedT.has(key)) {
            addToppingToMaker(scene, t, nextToppingIndex);
            nextToppingIndex += 1;
          }
        } catch (e) {}
      });
    }
  } catch (e) {}
}


function reset(scene) {
  selectedSize = null;
  selectedFlavor = null;
  toppings = [];
  drawCup(scene);
}

function serveDrink(scene) {
  if (!selectedSize || !selectedFlavor) {
  // no popup; just block serve
    return;
  }
  // If a drink is loaded from an order (currentOrderInMaker points to parent+index), try to match that specific drink
  if (currentOrderInMaker && currentOrderInMaker.parent) {
    const parent = currentOrderInMaker.parent;
    const idx = currentOrderInMaker.index;
    const drink = currentOrderInMaker.drink;
  if (drinkMatchesSelection(drink)) {
      // mark this drink served
      parent.drinks[idx].served = true;
      // award money for this drink only
      const reward = calculateReward(drink);
      money += reward;
      updateMoneyText(scene);
      try { showMoneyGain(scene, reward); } catch (e) {}
      // clear current maker selection
      currentOrderInMaker = null;
      reset(scene);
      // if all drinks in parent are served, complete the order and spawn next
      const allDone = parent.drinks.every(d => d.served);
      if (allDone) {
        // completed an entire order
        dayServedCount = (typeof dayServedCount === 'number') ? dayServedCount + 1 : 1;
        // award a coin for special customers (special visuals or story)
        try {
          const imgKey = parent && parent.appearance && parent.appearance.imageKey;
          if (isSpecialAppearance(imgKey) || parent && parent._isStory) {
            coins = (typeof coins === 'number') ? coins + 1 : 1;
            try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {}
            try { window._coins = coins; } catch (e) {}
          }
        } catch (e) {}
  try { markCharacterCollected(parent && parent.appearance && parent.appearance.imageKey); } catch (e) {}
        scene.time.delayedCall(900, () => {
          try { clearExtraBoba(); } catch (e) {}
          activeOrder = generateRandomOrder();
          refreshOrdersUI(scene);
          showOrdersScreen(scene);
          updateReceipt(scene, null);
          // if we've served 10 customers this day, show day-over overlay
          try { if (dayServedCount >= 7) { showDayOver(scene); } } catch (e) {}
        });
      } else {
        // otherwise keep the order active and show Orders screen so player can load next drink
        refreshOrdersUI(scene);
        showOrdersScreen(scene);
      }
      return;
    } else {
      // doesn't match the loaded drink — allow serving but apply penalty
      try {
        const penalty = Math.max(1, Math.floor(calculateReward(drink) * 0.5));
        money = (typeof money === 'number') ? money - penalty : -penalty;
        updateMoneyText(scene);
        try { showMoneyLoss(scene, penalty); } catch (e) {}
      } catch (e) {}
      // clear current maker selection
      currentOrderInMaker = null;
      reset(scene);
      return;
    }
  }

  // No loaded order: just a served custom drink
  // If there is an activeOrder waiting (but not loaded), allow serving to complete it when matched
  // No loaded drink: if activeOrder exists and any of its drinks match the current selection, serve that matching drink
  if (activeOrder && activeOrder.drinks) {
    // find a drink index that matches
    const matchIdx = activeOrder.drinks.findIndex(d => !d.served && drinkMatchesSelection(d));
  if (matchIdx !== -1) {
      activeOrder.drinks[matchIdx].served = true;
      const reward = calculateReward(activeOrder.drinks[matchIdx]);
      money += reward;
      updateMoneyText(scene);
      try { showMoneyGain(scene, reward); } catch (e) {}
      // if all drinks served, complete the order
      const allDone = activeOrder.drinks.every(d => d.served);
      if (allDone) {
        // completed an entire order
        dayServedCount = (typeof dayServedCount === 'number') ? dayServedCount + 1 : 1;
  try { markCharacterCollected(activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey); } catch (e) {}
  try { clearExtraBoba(); } catch (e) {}
  // award a coin for special customers
  try {
    const imgKey = activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey;
    if (isSpecialAppearance(imgKey) || activeOrder && activeOrder._isStory) {
      coins = (typeof coins === 'number') ? coins + 1 : 1;
      try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {}
      try { window._coins = coins; } catch (e) {}
    }
  } catch (e) {}
  activeOrder = generateRandomOrder();
  refreshOrdersUI(scene);
  showOrdersScreen(scene);
  updateReceipt(scene, null);
  try { if (dayServedCount >= 7) { showDayOver(scene); } } catch (e) {}
      } else {
        // still waiting on remaining drinks
        refreshOrdersUI(scene);
        showOrdersScreen(scene);
        updateReceipt(scene, activeOrder);
      }
      reset(scene);
      return;
    }
  }

  // For custom serves (not matching an order) apply a penalty and show loss animation
  try {
    const pseudo = { size: selectedSize, flavor: selectedFlavor, toppings };
    const penalty = Math.max(1, Math.floor(calculateReward(pseudo) * 0.5));
    money = (typeof money === 'number') ? money - penalty : -penalty;
    updateMoneyText(scene);
    try { showMoneyLoss(scene, penalty); } catch (e) {}
  } catch (e) {}
  // clear maker selection
  reset(scene);
  return;
}

// Automatically complete the current active order: mark drinks served, award money, and spawn next
function autoCompleteActiveOrder(scene) {
  try {
    if (!scene) scene = window._boba_scene;
    // If a specific drink is loaded in the maker, serve that drink only
    if (currentOrderInMaker && currentOrderInMaker.parent) {
      const parent = currentOrderInMaker.parent;
      const idx = currentOrderInMaker.index;
      if (parent && parent.drinks && parent.drinks[idx] && !parent.drinks[idx].served) {
        parent.drinks[idx].served = true;
        const reward = calculateReward(parent.drinks[idx]);
        money += reward;
        updateMoneyText(scene);
        try { showMoneyGain(scene, reward); } catch (e) {}
      }
      // if that completed the parent order, mark order complete and handle day end
      try {
        const allDone = parent.drinks.every(d => d.served);
        if (allDone) {
          dayServedCount = (typeof dayServedCount === 'number') ? dayServedCount + 1 : 1;
          // if reached day end, show summary overlay
          try { if (dayServedCount >= 7) { showDayOver(scene); return; } } catch (e) {}
          // otherwise spawn next
          try { markCharacterCollected(parent && parent.appearance && parent.appearance.imageKey); } catch (e) {}
          try { clearExtraBoba(); } catch (e) {}
          // award a coin for special customers
          try {
            const imgKey = parent && parent.appearance && parent.appearance.imageKey;
            if (isSpecialAppearance(imgKey) || parent && parent._isStory) {
              coins = (typeof coins === 'number') ? coins + 1 : 1;
              try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {}
              try { window._coins = coins; } catch (e) {}
            }
          } catch (e) {}
          scene.time.delayedCall(700, () => {
            activeOrder = generateRandomOrder();
            try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
            refreshOrdersUI(scene);
          });
        }
      } catch (e) {}
      currentOrderInMaker = null;
      reset(scene);
      refreshOrdersUI(scene);
      return;
    }

    // Otherwise, if there's an activeOrder, complete all its unserved drinks
    if (activeOrder && activeOrder.drinks && activeOrder.drinks.length > 0) {
      const toServe = activeOrder.drinks.filter(d => !d.served);
      if (toServe.length === 0) return;
      let total = 0;
      toServe.forEach(d => { d.served = true; total += calculateReward(d); });
      money += total;
      updateMoneyText(scene);
      try { showMoneyGain(scene, total); } catch (e) {}
      // completed an entire order
      dayServedCount = (typeof dayServedCount === 'number') ? dayServedCount + 1 : 1;
  try { markCharacterCollected(activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey); } catch (e) {}
      try { clearExtraBoba(); } catch (e) {}
      // award a coin for special customers
      try {
        const imgKey = activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey;
        if (isSpecialAppearance(imgKey) || activeOrder && activeOrder._isStory) {
          coins = (typeof coins === 'number') ? coins + 1 : 1;
          try { if (coinText) coinText.setText(`Coins: ${coins}`); } catch (e) {}
          try { window._coins = coins; } catch (e) {}
        }
      } catch (e) {}
      // if reached day end, show summary overlay
      try { if (dayServedCount >= 7) { showDayOver(scene); return; } } catch (e) {}
      // spawn next customer after a small delay so animations can play
      scene.time.delayedCall(700, () => {
        activeOrder = generateRandomOrder();
        try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
        refreshOrdersUI(scene);
      });
      return;
    }
  } catch (e) {}
}

// showTemporaryMessage removed — no temporary popups are used anymore.

function drawCup(scene) {
  const c = cupSprites.container;
  // destroy any previous scene-level info text so we don't leak
  if (cupSprites.infoText) {
    cupSprites.infoText.destroy();
    cupSprites.infoText = null;
  }
  c.removeAll(true);
  // Aesthetic tapered boba cup rendering
  const size = selectedSize || { radius: 80 };
  const cupRadius = size.radius;
  const cupWidth = cupRadius * 1.6; // a bit wider for a realistic cup
  const cupHeight = cupRadius * 2.0; // taller cup

  // cup glass body (tapered)
  const topW = cupWidth;
  const bottomW = Math.max(40, Math.floor(cupWidth * 0.6));
  const h = cupHeight;

  // light glass fill (behind liquid)
  const glassFill = scene.add.graphics();
  glassFill.fillStyle(0xffffff, 0.06);
  glassFill.beginPath();
  glassFill.moveTo(-topW/2, -h/2);
  glassFill.lineTo(topW/2, -h/2);
  glassFill.lineTo(bottomW/2, h/2);
  glassFill.lineTo(-bottomW/2, h/2);
  glassFill.closePath();
  glassFill.fillPath();
  c.add(glassFill);
  // stop any existing cup bob tween so the cup stays static
  if (cupSprites.bobTween) {
    cupSprites.bobTween.stop();
    cupSprites.bobTween = null;
  }
  // draw the full straw first (it will be partially covered by liquid)
  const strawX = Math.floor(topW / 6);
  // slightly shorten the straw bottom so a small portion is cut off visually
  const strawCut = Math.max(6, Math.floor(cupRadius * 0.06));
  const strawFullH = Math.floor(h * 1.05) - strawCut;
  const strawTopY = Math.floor(-h/2 - 42); // keep the top of the straw anchored
  const strawFullCY = Math.floor(strawTopY + strawFullH / 2);
  const strawFull = scene.add.rectangle(strawX, strawFullCY, 16, strawFullH, 0xff8b9b).setAngle(12).setOrigin(0.5);
  strawFull.setStrokeStyle(1, 0xcc6b75);
  const strawFullStripe = scene.add.rectangle(strawX, strawFullCY, 6, strawFullH, 0xffffff).setAngle(12).setOrigin(0.5).setAlpha(0.85);
  c.add(strawFull);
  c.add(strawFullStripe);

  // remove separate straw sway tween so straw follows the cup tilt
  if (cupSprites.strawTween) cupSprites.strawTween.stop();

  // liquid (tapered to match the cup shape)
  const flavor = selectedFlavor ? selectedFlavor.color : 0xf0e7df;
  const liquid = scene.add.graphics();
  liquid.fillStyle(flavor, 1);
  const liquidTop = -h/2 + 26;
  // place liquid bottom at the cup inner bottom edge (no rim gap)
  const rimGap = 0;
  const liquidBottom = Math.floor(h/2);
  let baseLiquidHeight = liquidBottom - liquidTop;
  // use fillProgress (0..1) to animate filling; default to 1 when not set
  let fp = (cupSprites.fillProgress == null) ? 1 : cupSprites.fillProgress;
  // If no flavor is selected, the cup should remain empty (no drink preview when changing size)
  if (!selectedFlavor) fp = 0;
  // clamp fillProgress
  const clampedFp = Math.max(0, Math.min(1, fp));
  let liquidHeight = Math.max(8, Math.floor(baseLiquidHeight * clampedFp));

  // compute current top Y so liquid grows from bottom up
  const currentTopY = liquidBottom - liquidHeight;

  // inner widths for liquid: make the liquid reach the cup edges with a tiny rim
  const innerTopW = Math.max(12, topW - 4);
  const innerBottomW = Math.max(12, bottomW);
  // compute interpolation factor of currentTopY between liquidTop (0) and liquidBottom (1)
  const interp = (currentTopY - liquidTop) / Math.max(1, (liquidBottom - liquidTop));
  // linear interpolate the half-width at the current Y so the liquid top sits on the cup's inner edge
  const halfInnerTopW = innerTopW / 2;
  const halfInnerBottomW = innerBottomW / 2;
  const halfWidthAtY = halfInnerTopW + (halfInnerBottomW - halfInnerTopW) * interp;

  // draw tapered liquid as polygon from currentTopY down to liquidBottom with edges matching the cup
  liquid.beginPath();
  liquid.moveTo(-halfWidthAtY, currentTopY);
  liquid.lineTo(halfWidthAtY, currentTopY);
  liquid.lineTo(innerBottomW/2, liquidBottom);
  liquid.lineTo(-innerBottomW/2, liquidBottom);
  liquid.closePath();
  liquid.fillPath();
  c.add(liquid);

  // ensure liquid is static (no ripple)
  if (cupSprites.liquidTween) {
    cupSprites.liquidTween.stop();
    cupSprites.liquidTween = null;
  }
  liquid.setScale(1, 1);

  // subtle glare on the left side of the liquid (based on current fill)
  const glare = scene.add.graphics();
  glare.fillStyle(0xffffff, 0.12);
  // position glare near the liquid surface (currentTopY)
  glare.fillEllipseShape(new Phaser.Geom.Ellipse(-halfWidthAtY*0.22, currentTopY + Math.max(6, Math.floor(liquidHeight*0.06)), halfWidthAtY*0.24, Math.max(8, Math.floor(liquidHeight*0.5))));
  c.add(glare);

  // per-flavor liquid decorations (small speckles, dots, leaves, etc.) to better match flavor names
  try {
    // Only generate decorations when a flavor is actually selected and the cup has visible fill
    if (selectedFlavor && clampedFp > 0) {
      const deco = scene.add.container(0, 0);
      // define an internal helper to add a speckle
      const addSpeck = (cx, cy, r, col, alpha) => {
        const g = scene.add.circle(cx, cy, r, col).setAlpha(alpha || 0.95).setStrokeStyle(0, 0x000000, 0);
        deco.add(g);
      };
      const addShard = (cx, cy, size, col) => {
        const poly = scene.add.polygon(cx, cy, [0,-size, size/2,0,0,size,-size/2,0], col).setStrokeStyle(0, 0x000000, 0);
        deco.add(poly);
      };
      const addLeaf = (cx, cy, w, h, col) => {
        const leaf = scene.add.ellipse(cx, cy, w, h, col).setAngle(20).setAlpha(0.95).setStrokeStyle(0, 0x000000, 0);
        deco.add(leaf);
      };
      // small diamond sparkle helper (rotated square / diamond)
      const addDiamond = (cx, cy, size, col, alpha) => {
        const pts = [0, -size, size, 0, 0, size, -size, 0];
        const d = scene.add.polygon(cx, cy, pts, col).setAlpha(alpha || 0.95).setStrokeStyle(1, 0x000000);
        deco.add(d);
      };
      // pick decoration placement vertical area inside liquid top..bottom band
      const decoTop = currentTopY + 4;
      const decoBottom = liquidBottom - 6;
      // helper: for a given world Y compute the half-inner width at that Y (taper interpolation)
      const computeHalfWidthAtY = (yy) => {
        try {
          const interpY = (yy - liquidTop) / Math.max(1, (liquidBottom - liquidTop));
          const clamped = Phaser.Math.Clamp(interpY, 0, 1);
          return halfInnerTopW + (halfInnerBottomW - halfInnerTopW) * clamped;
        } catch (e) { return halfInnerBottomW / 2; }
      };
      // helper: pick a random X that is guaranteed inside the tapered cup at Y
      const pickXForY = (yy, pad) => {
        try {
          const half = computeHalfWidthAtY(yy);
          const leftBound = -half + (pad || 8);
          const rightBound = half - (pad || 8);
          // ensure left <= right
          const l = Math.min(leftBound, rightBound);
          const r = Math.max(leftBound, rightBound);
          return Phaser.Math.Between(Math.floor(l), Math.floor(r));
        } catch (e) { return Phaser.Math.Between(-Math.floor(halfInnerBottomW/2)+8, Math.floor(halfInnerBottomW/2)-8); }
      };
      const flavorKey = selectedFlavor ? (selectedFlavor.key || '').toLowerCase() : '';
      // create a few decorations depending on flavor
      if (flavorKey.indexOf('oreo') !== -1 || flavorKey.indexOf('cookies') !== -1) {
        // cookies and cream: small black dots (cookie bits)
        for (let i=0;i<20;i++) {
          const ry = Phaser.Math.Between(decoTop, decoBottom);
          const rx = pickXForY(ry, 2);
          addSpeck(rx, ry, Phaser.Math.Between(1,2), 0x1f1f1f, 0.95);
        }
      } else if (flavorKey.indexOf('matcha') !== -1 || flavorKey.indexOf('green tea') !== -1 || flavorKey.indexOf('genmaicha') !== -1) {
        // greenish leaves / flecks
        for (let i=0;i<8;i++) {
          const ry = Phaser.Math.Between(decoTop, decoBottom);
          const rx = pickXForY(ry, 4);
          addLeaf(rx, ry, Phaser.Math.Between(6,10), Phaser.Math.Between(3,6), 0x7fcf8a);
        }
        // genmaicha: add toasted rice shards
        if (flavorKey.indexOf('genmaicha') !== -1) {
          for (let i=0;i<6;i++) { const ry = Phaser.Math.Between(decoTop, decoBottom); addShard(pickXForY(ry,3), ry, Phaser.Math.Between(4,8), 0xd9cfa3); }
        }
      } else if (flavorKey.indexOf('toasted marshmallow') !== -1 || flavorKey.indexOf('churro') !== -1 || flavorKey.indexOf('chai') !== -1) {
        // warm spice flecks and tiny caramel shards
        for (let i=0;i<10;i++) { const ry=Phaser.Math.Between(decoTop,decoBottom); addSpeck(pickXForY(ry,2), ry, Phaser.Math.Between(1,3), 0x8b5a3a, 0.9); }
        for (let i=0;i<6;i++) { const ry=Phaser.Math.Between(decoTop,decoBottom); addShard(pickXForY(ry,3), ry, Phaser.Math.Between(3,7), 0xe0a36b); }
      } else if (flavorKey.indexOf('banana') !== -1 || flavorKey.indexOf('mango') !== -1 || flavorKey.indexOf('avocado') !== -1) {
        // fruit bits as small rounded rectangles (use small circles here)
        for (let i=0;i<8;i++) { const ry=Phaser.Math.Between(decoTop,decoBottom); addSpeck(pickXForY(ry,3), ry, Phaser.Math.Between(2,4), (flavorKey.indexOf('banana')!==-1)?0xfff2a8:0xffd28a, 0.95); }
      } else if (flavorKey.indexOf('lemon') !== -1 || flavorKey.indexOf('honey') !== -1) {
        // lemon: tiny citrus pith dots and honey streaks
        for (let i=0;i<12;i++) { const ry=Phaser.Math.Between(decoTop,decoBottom); addSpeck(pickXForY(ry,2), ry, 1, 0xfff6a8, 0.9); }
      } else if (flavorKey.indexOf('peppermint') !== -1 || flavorKey.indexOf('mint') !== -1) {
        // peppermint cocoa: red diamond sparkles instead of white shards
        for (let i = 0; i < 10; i++) {
          const ry = Phaser.Math.Between(decoTop, decoBottom);
          const rx = pickXForY(ry, 2);
          addDiamond(rx, ry, Phaser.Math.Between(2, 4), 0xff4d4d, 0.98);
        }
      } else if (flavorKey.indexOf('soy') !== -1 || flavorKey.indexOf('vanilla') !== -1) {
        // creamy vanilla/soy: a few soft white glints
        for (let i=0;i<6;i++) { const ry=Phaser.Math.Between(decoTop,decoBottom); addSpeck(pickXForY(ry,3), ry, Phaser.Math.Between(2,4), 0xffffff, 0.65); }
      }
      // add deco container at correct depth: under toppings but above liquid/glare
      deco.setDepth(1750);
      c.add(deco);
    }
  } catch (e) {}

  // lid removed per request (no top oval)

  // (old straw visuals removed - replaced by full straw drawn earlier and upper straw piece later)

  // glass outline (on top) to show border and rim
  const glassStroke = scene.add.graphics();
  glassStroke.lineStyle(3, 0xcfc7c3, 1);
  glassStroke.beginPath();
  glassStroke.moveTo(-topW/2, -h/2);
  glassStroke.lineTo(topW/2, -h/2);
  glassStroke.lineTo(bottomW/2, h/2);
  glassStroke.lineTo(-bottomW/2, h/2);
  glassStroke.closePath();
  glassStroke.strokePath();
  c.add(glassStroke);
  // (no separate upper straw piece — full straw drawn earlier)

  // draw toppings positioned toward the bottom of the liquid area
  const txArea = { left: -innerBottomW/2 + 8, right: innerBottomW/2 - 8, top: liquidBottom - Math.min(48, liquidHeight * 0.22), bottom: liquidBottom - 2 };
  // Place toppings without overlap: try random positions near the bottom band but enforce min distance
  const placed = [];
  const totalT = toppings.length;
  for (let idx = 0; idx < totalT; idx++) {
    const t = toppings[idx];
  // estimate a radius/size for spacing
  const estRadius = (t.key === 'Boba') ? Math.max(6, Math.floor(cupRadius * 0.06)) : (t.key === 'Pudding' ? Math.max(12, Math.floor(cupRadius * 0.12)) : Math.max(10, Math.floor(cupRadius * 0.1)));
  // unify small topping pearl sizes to be closer to Boba's visual size
  const pearlR = Math.max(6, Math.floor(cupRadius * 0.06));
  // small specks / crumbs
  const smallDotR = Math.max(1, Math.floor(pearlR * 0.45));
    const minDist = estRadius * 2 + 6;
    let x, y;
    // if this topping already has a stored position, reuse it so it doesn't move
    if (typeof t._x === 'number' && typeof t._y === 'number') {
      // clamp previously stored coords to remain inside the valid txArea
      const pad = Math.max(4, estRadius);
      x = Phaser.Math.Clamp(t._x, txArea.left + pad, txArea.right - pad);
      y = Phaser.Math.Clamp(t._y, txArea.top + pad, txArea.bottom - pad);
      // store back clamped values so future draws also respect bounds
      t._x = x;
      t._y = y;
    } else {
      // find a spot that doesn't overlap existing placed toppings
      let tries = 0;
      do {
        x = Phaser.Math.Between(txArea.left + 6, txArea.right - 6);
        y = Phaser.Math.Between(txArea.top + 4, txArea.bottom - 4);
        tries++;
        if (placed.length === 0) break;
      } while (tries < 200 && placed.some(p => Phaser.Math.Distance.Between(p.x, p.y, x, y) < minDist));
      // store the resolved coordinates on the topping so subsequent redraws keep it in place
  t._x = x;
  t._y = y;
    }
    placed.push({ x, y, r: estRadius });

  if (t.key === 'Boba') {
      // Render boba pearls using the preloaded image if available
      const radius = estRadius;
      try {
        if (scene.textures && scene.textures.exists && scene.textures.exists('Boba_img')) {
          // draw a thin black outline behind the sprite so it reads with a consistent border
          const outlineR = Math.max(6, Math.floor(radius * 1.1));
          const outline = scene.add.circle(x, y, outlineR, 0x000000).setAlpha(0).setStrokeStyle(0, 0x000000);
          try { outline.setDepth(1799); } catch (e) {}
          c.add(outline);
          const img = scene.add.image(x, y, 'Boba_img');
          img.setOrigin(0.5);
          // size the image to roughly match the expected pearl radius
          let desired = Math.max(6, Math.floor(radius * 2));
          try { img.setDisplaySize(desired, desired); } catch (e) { try { img.setScale(0.3); } catch (e) {} desired = null; }
          try { console.log('drawCup: Boba_img texture exists, creating pearl image', { x, y, desired }); } catch (e) {}
          // add and animate from small -> final display size (use scale tween to 1.0)
          c.add(img);
          try { img.setDepth(1800); } catch (e) {}
          if (!t._placed) {
            try {
              outline.setAlpha(1);
              outline.setScale(0.2);
              img.setScale(0.12);
              img.setAlpha(0);
              scene.tweens.add({ targets: [outline, img], scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' });
            } catch (e) {
              try { img.setScale(1.0); img.setAlpha(1.0); outline.setAlpha(1); } catch (e) {}
            }
            t._placed = true;
          }
        } else {
          try { console.log('drawCup: Boba_img texture missing, falling back to circles for boba'); } catch (e) {}
          // fallback to colored circle if image missing
          const b = scene.add.circle(x, y, radius, t.color).setStrokeStyle(1, 0x000000).setAlpha(0.98);
          const sb = scene.add.ellipse(x - Math.floor(radius * 0.35), y - Math.floor(radius * 0.35), Math.max(3, radius * 0.4), Math.max(2, radius * 0.3), 0xffffff).setAlpha(0.6);
          c.add(b);
          c.add(sb);
          if (!t._placed) {
            try { b.setScale(0.2); b.setAlpha(0); sb.setAlpha(0); scene.tweens.add({ targets: [b, sb], scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { b.setScale(1); b.setAlpha(1); sb.setAlpha(1); } catch (e) {} }
            t._placed = true;
          }
        }
      } catch (e) {
        // safe fallback
      }
    } else if (t.key === 'Mochi') {
      // soft rectangular mochi with a small highlight
      const w = Math.max(14, cupRadius * 0.14);
      const hrect = Math.max(10, cupRadius * 0.06);
      const rct = scene.add.roundedRect ? scene.add.roundedRect(x, y, w, hrect, 6, t.color) : scene.add.rectangle(x, y, w, hrect, t.color);
      try { if (rct.setStrokeStyle) rct.setStrokeStyle(1, 0x000000); } catch (e) {}
      const hm = scene.add.ellipse(x - Math.floor(w * 0.2), y - Math.floor(hrect * 0.25), Math.max(6, w * 0.25), Math.max(4, hrect * 0.45), 0xffffff).setAlpha(0.5);
      c.add(rct);
      c.add(hm);
      if (!t._placed) {
        try { rct.setScale(0.4); rct.setAlpha(0); hm.setAlpha(0); scene.tweens.add({ targets: [rct, hm], scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { rct.setScale(1); rct.setAlpha(1); hm.setAlpha(1); } catch (e) {} }
        t._placed = true;
      }
    } else if (t.key === 'Pudding' || t.key === 'Egg Pudding') {
      // custard-like semi-oval with caramel top
      const p = scene.add.ellipse(x, y, Math.max(24, cupRadius * 0.26), Math.max(14, cupRadius * 0.12), t.color).setStrokeStyle(1, 0x000000).setAlpha(0.98);
      const hp = scene.add.ellipse(x - 6, y - 6, Math.max(6, cupRadius * 0.12), Math.max(4, cupRadius * 0.07), 0xffffff).setAlpha(0.55);
      // caramel top for egg pudding
      if (String(t.key).toLowerCase().indexOf('egg') !== -1) {
        const caramel = scene.add.ellipse(x, y - Math.floor(cupRadius * 0.06), Math.max(20, cupRadius * 0.18), Math.max(8, cupRadius * 0.06), 0xcc8b3a).setAlpha(0.95);
        try { caramel.setStrokeStyle(1, 0x000000); } catch (e) {}
        c.add(caramel);
      }
      c.add(p);
      c.add(hp);
      if (!t._placed) {
        try { p.setScale(0.4); p.setAlpha(0); hp.setAlpha(0); scene.tweens.add({ targets: [p, hp], scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); hp.setAlpha(1); } catch (e) {} }
        t._placed = true;
      }
    } else if (t.key === 'Red Bean') {
      // cluster of small red-brown beans
      const group = scene.add.container(x, y);
      for (let i = 0; i < 5; i++) {
        const rx = Phaser.Math.Between(-8, 8);
        const ry = Phaser.Math.Between(-6, 6);
        const rb = scene.add.ellipse(rx, ry, 6, 4, 0xbf6b6b).setStrokeStyle(1, 0x000000);
        group.add(rb);
      }
      c.add(group);
      if (!t._placed) { try { group.setScale(0.4); group.setAlpha(0); scene.tweens.add({ targets: group, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { group.setScale(1); group.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Aloe') {
      // small green translucent cubes (aloe chunks)
      const g1 = scene.add.rectangle(x, y, 10, 10, 0x9be6b8).setAlpha(0.9).setStrokeStyle(1, 0x000000);
      c.add(g1);
      if (!t._placed) { try { g1.setScale(0.4); g1.setAlpha(0); scene.tweens.add({ targets: g1, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { g1.setScale(1); g1.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Coconut') {
      // white coconut flakes
      const flakes = scene.add.container(x, y);
      for (let i = 0; i < 6; i++) {
        const fx = Phaser.Math.Between(-8, 8);
        const fy = Phaser.Math.Between(-6, 6);
        const fl = scene.add.rectangle(fx, fy, 4, 8, 0xffffff).setAngle(Phaser.Math.Between(0, 360)).setStrokeStyle(1, 0x000000).setAlpha(0.95);
        flakes.add(fl);
      }
      c.add(flakes);
      if (!t._placed) { try { flakes.setScale(0.4); flakes.setAlpha(0); scene.tweens.add({ targets: flakes, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { flakes.setScale(1); flakes.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Grass Jelly') {
      const gj = scene.add.rectangle(x, y, Math.max(18, estRadius * 2), Math.max(10, estRadius), 0x3b6b6b).setAlpha(0.95).setStrokeStyle(1, 0x000000);
      c.add(gj);
      if (!t._placed) { try { gj.setScale(0.4); gj.setAlpha(0); scene.tweens.add({ targets: gj, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { gj.setScale(1); gj.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Popping Boba') {
      // single popping pearl per topping instance (we create multiple instances in addTopping)
      const colors = [0xffb3d9, 0xffe36b, 0xdde6ff, 0xa6d393, 0xffc66b];
      const col = Phaser.Utils.Array.GetRandom(colors);
      const s = scene.add.circle(x, y, pearlR, col).setStrokeStyle(1, 0x000000).setAlpha(0.98);
      c.add(s);
      if (!t._placed) {
        try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} }
        t._placed = true;
      }
    } else if (t.key === 'Crystal Boba') {
      // single translucent bluish pearl per instance
      const gem = scene.add.circle(x, y, pearlR, 0xdde6ff).setAlpha(0.9).setStrokeStyle(1, 0x000000);
      c.add(gem);
      if (!t._placed) { try { gem.setScale(0.4); gem.setAlpha(0); scene.tweens.add({ targets: gem, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { gem.setScale(1); gem.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Coffee Jelly' || t.key === 'Tapioca') {
      // coffee jelly as small brown cubes; tapioca as darker pearls
      if (String(t.key).toLowerCase().indexOf('coffee') !== -1) {
        const g3 = scene.add.container(x, y);
        for (let i = 0; i < 4; i++) {
          const rx = Phaser.Math.Between(-6, 6);
          const ry = Phaser.Math.Between(-4, 4);
          const cube = scene.add.rectangle(rx, ry, 6, 6, 0x6b4f3b).setStrokeStyle(1, 0x000000).setAlpha(0.98);
          g3.add(cube);
        }
        c.add(g3);
        if (!t._placed) { try { g3.setScale(0.4); g3.setAlpha(0); scene.tweens.add({ targets: g3, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { g3.setScale(1); g3.setAlpha(1); } catch (e) {} } t._placed = true; }
      } else {
        // tapioca: draw a single dark pearl per instance
        const p = scene.add.circle(x, y, pearlR, 0x3a2f2f).setStrokeStyle(1, 0x000000);
        c.add(p);
        if (!t._placed) { try { p.setScale(0.4); p.setAlpha(0); scene.tweens.add({ targets: p, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); } catch (e) {} } t._placed = true; }
      }
    } else if (t.key === 'Taro Balls') {
      // single taro-colored pearl
      const s = scene.add.circle(x, y, pearlR, 0xd7b3ff).setStrokeStyle(1, 0x000000);
      c.add(s);
      if (!t._placed) { try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Marshmallow') {
      const mm = scene.add.ellipse(x, y, Math.max(10, estRadius*1.2), Math.max(6, estRadius*0.8), 0xfff0f0).setStrokeStyle(1, 0x000000).setAlpha(0.98);
      c.add(mm);
      if (!t._placed) { try { mm.setScale(0.4); mm.setAlpha(0); scene.tweens.add({ targets: mm, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { mm.setScale(1); mm.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Mango Bits') {
      const s = scene.add.rectangle(x, y, 8, 6, 0xffd28a).setStrokeStyle(1, 0x000000);
      c.add(s);
      if (!t._placed) { try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Rainbow Jelly' || t.key === 'Rainbow Boba') {
      // single colorful representative element
      const colsR = [0xffb3ff, 0xffe36b, 0xdde6ff, 0xa6d393, 0xff6ec7];
      if (String(t.key).toLowerCase().indexOf('boba') !== -1) {
        const s = scene.add.circle(x, y, pearlR, Phaser.Utils.Array.GetRandom(colsR)).setStrokeStyle(1, 0x000000);
        c.add(s);
        if (!t._placed) { try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
      } else {
        const shard = scene.add.polygon(x, y, [0, -6, 4, 0, 0, 6, -4, 0], Phaser.Utils.Array.GetRandom(colsR)).setStrokeStyle(1, 0x000000);
        c.add(shard);
        if (!t._placed) { try { shard.setScale(0.4); shard.setAlpha(0); scene.tweens.add({ targets: shard, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { shard.setScale(1); shard.setAlpha(1); } catch (e) {} } t._placed = true; }
      }
    } else if (t.key === 'Chia Seeds') {
      // single chia dot
      const d = scene.add.circle(x, y, smallDotR, 0x000000);
      c.add(d);
      if (!t._placed) { try { d.setScale(0.6); d.setAlpha(0); scene.tweens.add({ targets: d, scale: 1.0, alpha: 1.0, duration: 220, ease: 'Quad.easeOut' }); } catch (e) { try { d.setScale(1); d.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Oat Granola') {
      const r = scene.add.rectangle(x, y, 8, 4, 0xd6caae).setStrokeStyle(1, 0x000000);
      c.add(r);
      if (!t._placed) { try { r.setScale(0.5); r.setAlpha(0); scene.tweens.add({ targets: r, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { r.setScale(1); r.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Honey Pearls') {
      const s = scene.add.circle(x, y, pearlR, 0xffdca3).setStrokeStyle(1, 0x000000);
      c.add(s);
      if (!t._placed) { try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Cookie') {
      const cookie = scene.add.circle(x, y, Math.max(10, estRadius * 1.1), 0xd2b48c).setStrokeStyle(2, 0x6b4f3b).setAlpha(0.98);
      // a few fixed chips around center
      const chip1 = scene.add.circle(x - 4, y - 2, 2, 0x6b4f3b);
      const chip2 = scene.add.circle(x + 3, y + 1, 2, 0x6b4f3b);
      c.add(cookie); c.add(chip1); c.add(chip2);
      if (!t._placed) { try { cookie.setScale(0.4); cookie.setAlpha(0); chip1.setAlpha(0); chip2.setAlpha(0); scene.tweens.add({ targets: [cookie, chip1, chip2], scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { cookie.setScale(1); cookie.setAlpha(1); chip1.setAlpha(1); chip2.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Mystery Boba') {
      // single mystery pearl (deterministic color per instance)
      if (!t._mysteryColor) t._mysteryColor = Phaser.Display.Color.Random().color;
      const s = scene.add.circle(x, y, pearlR, t._mysteryColor).setStrokeStyle(1, 0x000000);
      c.add(s);
      if (!t._placed) { try { s.setScale(0.4); s.setAlpha(0); scene.tweens.add({ targets: s, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { s.setScale(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Sun Jelly') {
      // translucent yellow blob (sunny jelly)
      const sj = scene.add.polygon(x, y, [0,-12,6,-2,12,0,6,4,0,12,-6,4,-12,0,-6,-2], 0xffe36b).setAlpha(0.9).setStrokeStyle(1, 0x000000);
      c.add(sj);
      if (!t._placed) { try { sj.setScale(0.4); sj.setAlpha(0); scene.tweens.add({ targets: sj, scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { sj.setScale(1); sj.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Star Boba') {
      // keep star boba as implemented
      const rOuter = Math.max(10, Math.floor(estRadius * 1.2));
      const rInner = Math.max(4, Math.floor(rOuter * 0.45));
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const angleOuter = -Math.PI / 2 + i * (2 * Math.PI / 5);
        const angleInner = angleOuter + Math.PI / 5;
        pts.push(Math.round(rOuter * Math.cos(angleOuter)), Math.round(rOuter * Math.sin(angleOuter)));
        pts.push(Math.round(rInner * Math.cos(angleInner)), Math.round(rInner * Math.sin(angleInner)));
      }
      const star = scene.add.polygon(x, y, pts, t.color).setStrokeStyle(2, 0x000000).setAlpha(0.98);
      c.add(star);
      if (!t._placed) { try { star.setScale(0.4); star.setAlpha(0); scene.tweens.add({ targets: star, scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { star.setScale(1); star.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Matcha Boba') {
      const p = scene.add.circle(x, y, pearlR, 0x2f7b3a).setStrokeStyle(1, 0x000000);
      c.add(p);
      if (!t._placed) { try { p.setScale(0.4); p.setAlpha(0); scene.tweens.add({ targets: p, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Yogurt Boba') {
      const p = scene.add.circle(x, y, pearlR, 0xf6f7f9).setStrokeStyle(1, 0x000000).setAlpha(0.98);
      const s = scene.add.circle(x + 3, y - 2, smallDotR, 0xfff2e6);
      c.add(p); c.add(s);
      if (!t._placed) { try { p.setScale(0.4); p.setAlpha(0); s.setAlpha(0); scene.tweens.add({ targets: [p, s], scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); s.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Custard Cubes') {
      const cube = scene.add.rectangle(x, y, 10, 8, 0xf0c969).setStrokeStyle(1, 0x6b4f3b).setAlpha(0.98);
      c.add(cube);
      if (!t._placed) { try { cube.setScale(0.4); cube.setAlpha(0); scene.tweens.add({ targets: cube, scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { cube.setScale(1); cube.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Sweet Corn') {
      const k = scene.add.ellipse(x, y, 8, 6, 0xfff6a8).setStrokeStyle(1, 0x6b4f3b);
      c.add(k);
      if (!t._placed) { try { k.setScale(0.4); k.setAlpha(0); scene.tweens.add({ targets: k, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { k.setScale(1); k.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Sea Salt Caramel Cubes') {
      const cube = scene.add.rectangle(x, y, 10, 8, 0xd9b38a).setStrokeStyle(1, 0x5a3f2a);
      const shine = scene.add.ellipse(x - 2, y - 3, 6, 3, 0xfff6e0).setAlpha(0.35);
      c.add(cube); c.add(shine);
      if (!t._placed) { try { cube.setScale(0.4); cube.setAlpha(0); shine.setAlpha(0); scene.tweens.add({ targets: [cube, shine], scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { cube.setScale(1); cube.setAlpha(1); shine.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Pistachio Crumbs') {
      // a few small deterministic crumbs
      const cr1 = scene.add.circle(x - 3, y - 2, smallDotR, 0x8fb38a).setStrokeStyle(1, 0x3f4f3f);
      const cr2 = scene.add.circle(x + 2, y + 1, smallDotR, 0x8fb38a).setStrokeStyle(1, 0x3f4f3f);
      c.add(cr1); c.add(cr2);
      if (!t._placed) { try { cr1.setAlpha(0); cr2.setAlpha(0); scene.tweens.add({ targets: [cr1, cr2], alpha: 1.0, duration: 240, ease: 'Quad.easeOut' }); } catch (e) { try { cr1.setAlpha(1); cr2.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Jasmine Pearls') {
      const p = scene.add.circle(x, y, pearlR, 0xfff2d9).setStrokeStyle(1, 0x000000);
      const f = scene.add.circle(x + 3, y - 2, smallDotR, 0xffd6b3);
      c.add(p); c.add(f);
      if (!t._placed) { try { p.setScale(0.4); p.setAlpha(0); f.setAlpha(0); scene.tweens.add({ targets: [p, f], scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); f.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Lavender Pearls') {
      const p = scene.add.circle(x, y, pearlR, 0xd7c7ff).setStrokeStyle(1, 0x000000);
      c.add(p);
      if (!t._placed) { try { p.setScale(0.4); p.setAlpha(0); scene.tweens.add({ targets: p, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { p.setScale(1); p.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Tea Jelly') {
      const shard = scene.add.polygon(x, y, [0, -8, 6, 0, 0, 8, -6, 0], 0xb88b5a).setStrokeStyle(1, 0x000000).setAlpha(0.95);
      c.add(shard);
      if (!t._placed) { try { shard.setScale(0.4); shard.setAlpha(0); scene.tweens.add({ targets: shard, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { shard.setScale(1); shard.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Ube Pudding') {
      const up = scene.add.container(x, y);
      const pud = scene.add.ellipse(0, 0, Math.max(18, estRadius*1.6), Math.max(10, estRadius), 0x6f3fa6).setStrokeStyle(1,0x000000);
      const shine = scene.add.ellipse(-6, -6, Math.max(8, estRadius*0.6), Math.max(4, estRadius*0.4), 0xffe6ff).setAlpha(0.25);
      up.add(pud); up.add(shine);
      c.add(up);
      if (!t._placed) { try { up.setScale(0.4); up.setAlpha(0); scene.tweens.add({ targets: up, scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { up.setScale(1); up.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Blueberry Jelly') {
      const shard = scene.add.polygon(x, y, [0, -8, 6, 0, 0, 8, -6, 0], 0x6b5fd9).setStrokeStyle(1, 0x000000);
      c.add(shard);
      if (!t._placed) { try { shard.setScale(0.4); shard.setAlpha(0); scene.tweens.add({ targets: shard, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { shard.setScale(1); shard.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Peach Jelly') {
      const shard = scene.add.polygon(x, y, [0, -8, 6, 0, 0, 8, -6, 0], 0xffc9a8).setStrokeStyle(1, 0x000000);
      c.add(shard);
      if (!t._placed) { try { shard.setScale(0.4); shard.setAlpha(0); scene.tweens.add({ targets: shard, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { shard.setScale(1); shard.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else if (t.key === 'Konjac Jelly') {
      const cube = scene.add.rectangle(x, y, 10, 8, 0xcfcfcf).setStrokeStyle(1, 0x8f8f8f).setAlpha(0.9);
      c.add(cube);
      if (!t._placed) { try { cube.setScale(0.4); cube.setAlpha(0); scene.tweens.add({ targets: cube, scale: 1.0, alpha: 1.0, duration: 260, ease: 'Back.easeOut' }); } catch (e) { try { cube.setScale(1); cube.setAlpha(1); } catch (e) {} } t._placed = true; }
    } else {
      // default generic shape with black outline
      const poly = scene.add.polygon(x, y, [0, -10, 10, 0, 0, 10, -10, 0], t.color).setStrokeStyle(1, 0x000000).setAlpha(0.96);
      c.add(poly);
      if (!t._placed) { try { poly.setScale(0.4); poly.setAlpha(0); scene.tweens.add({ targets: poly, scale: 1.0, alpha: 1.0, duration: 300, ease: 'Back.easeOut' }); } catch (e) { try { poly.setScale(1); poly.setAlpha(1); } catch (e) {} } t._placed = true; }
    }
  }

  // info text below cup (scene-level so it doesn't move with the cup)
  const uniqueToppings = [...new Set(toppings.map(t => t.key))];
  const infoX = c.x - 174;
  const infoY = c.y + h / 2 + 46;
  // show info without the 'Toppings:' label
  cupSprites.infoText = scene.add.text(infoX, infoY, `Size: ${selectedSize ? selectedSize.key : '—'}  |  Flavor: ${selectedFlavor ? selectedFlavor.key : '—'}  |  ${uniqueToppings.join(', ') || 'None'}`, { font: 'bold 16px Poppins', fill: '#333' });
  // only show this info in the Maker UI
  cupSprites.infoText.setVisible(currentScreen === 'maker');
}

// --- Orders / Customers UI ---
function generateRandomOrder() {
  if (!customersEnabled) return null;
  // Special story characters at specific days: Fiona on Day 3, Penelope on Day 6 (only once)
  try {
    if (typeof dayNumber === 'number' && lastStoryShownDay !== dayNumber) {
      let sc = null;
      if (dayNumber === 3) sc = storyCharacters.find(s => s.key === 'Fiona');
        else if (dayNumber === 6) sc = storyCharacters.find(s => s.key === 'Penelope');
    else if (dayNumber === 9) sc = storyCharacters.find(s => s.key === 'Philip');
  else if (dayNumber === 12) sc = storyCharacters.find(s => s.key === 'Ian');
  else if (dayNumber === 15) sc = storyCharacters.find(s => s.key === 'Debbie');
  if (!sc && dayNumber === 18) sc = storyCharacters.find(s => s.key === 'Carl');
  if (!sc && dayNumber === 21) sc = storyCharacters.find(s => s.key === 'Liam');
  if (!sc && dayNumber === 24) sc = storyCharacters.find(s => s.key === 'PenelopeReturn');
  if (!sc && dayNumber === 27) sc = storyCharacters.find(s => s.key === 'Gray');
  if (!sc && dayNumber === 30) sc = storyCharacters.find(s => s.key === 'Villain');
  if (!sc && dayNumber === 33) sc = storyCharacters.find(s => s.key === 'Carl2');
  if (sc) {
        lastStoryShownDay = dayNumber;
        const order = { id: Phaser.Utils.String.UUID(), drinks: [] };
        order.size = null;
        order.flavor = null;
        order.toppings = [];
  order.appearance = { ...generateRandomAppearance(), imageKey: sc.imageKey };
  order._isStory = true;
  order._storyData = sc;
  // record which day this story order was scheduled for so we only show its dialogue on that day
  order._scheduledDay = dayNumber;
        return order;
      }
    }
  } catch (e) {}
  const sizes = window._BA_SIZES || [{key:'Medium', radius:100}];
  // Prefer to generate orders from items the player actually owns. If owned lists are empty,
  // fall back to the master lists so the game remains playable.
  const flavors = (ownedFlavors && ownedFlavors.length) ? ownedFlavors : (window._BA_FLAVORS || [{key:'Classic Milk Tea', color:0xd6b08b}]);
  const tops = (ownedToppings && ownedToppings.length) ? ownedToppings : (window._BA_TOPPINGS || [{key:'Boba', color:0x241f1f}]);
  // Decide how many drinks this customer orders: mostly 1, sometimes 2, rarely 3
  const r = Math.random();
  let drinkCount = 1;
  if (r < 0.12) drinkCount = 3; // ~12% chance 3 drinks
  else if (r < 0.42) drinkCount = 2; // ~30% chance 2 drinks
  else drinkCount = 1; // ~58% chance single

  const drinks = [];
  for (let d = 0; d < drinkCount; d++) {
    const size = Phaser.Utils.Array.GetRandom(sizes);
    const flavor = Phaser.Utils.Array.GetRandom(flavors);
    // choose 0..3 unique toppings for variety (some customers might skip toppings)
    const topCount = Phaser.Math.Between(0, Math.min(3, tops.length));
    const topsShuffled = Phaser.Utils.Array.Shuffle(tops.slice());
    const chosen = topsShuffled.slice(0, topCount);
    drinks.push({ size, flavor, toppings: chosen, served: false });
  }
  // convenience fields for single-drink compatibility (first drink)
  const order = { id: Phaser.Utils.String.UUID(), drinks };
  if (drinks.length > 0) {
    order.size = drinks[0].size;
    order.flavor = drinks[0].flavor;
    order.toppings = drinks[0].toppings;
  }
  // attach a randomly generated customer appearance, ensure it's not identical to last
  order.appearance = generateRandomAppearance();
  // randomly pick a customer image variant for visual variety
  try {
    // pick randomly from available customer keys
  // exclude any story character image keys from the random pool so regular customers never accidentally use them
  const storyImageKeys = (storyCharacters || []).map(s => s.imageKey).filter(Boolean);
  let keys = ['customer1','customer2','customer3','customer4','customer5','customer6','customer7','customer8','customer9','customer10'];
  keys = keys.filter(kk => !storyImageKeys.includes(kk));
  const k = keys[Phaser.Math.Between(0, keys.length - 1)];
  order.appearance.imageKey = k;
  // every 5 days, replace the image with a random OTH/TVD special character image (but keep it a normal customer)
  try {
  if (typeof dayNumber === 'number' && dayNumber % 5 === 0 && lastSpecialShownDay !== dayNumber) {
  const othKeys = ['Lucas','Nathan','Haley','Peyton','Brooke','Callisto'];
  const tvdKeys = ['Stefan','Damon','Elena','Caroline','Bonnie','Callisto'];
      // include story characters as possible visual specials after day 33
      let specialKeys = othKeys.concat(tvdKeys).filter(Boolean);
      try {
        if (typeof dayNumber === 'number' && dayNumber > 33 && Array.isArray(storyCharacters)) {
          const storyKeys = (storyCharacters || []).map(s => s.imageKey).filter(Boolean);
          specialKeys = specialKeys.concat(storyKeys);
        }
      } catch (e) {}
      // dedupe
      specialKeys = Array.from(new Set(specialKeys)).filter(Boolean);
      if (specialKeys.length > 0) {
        // force Halez.png (asset key 'Haley') on Day 35 specifically
        let pick = null;
        if (dayNumber === 35) {
          pick = 'Haley';
        } else {
          pick = specialKeys[Phaser.Math.Between(0, specialKeys.length - 1)];
        }
        if (pick) {
          order.appearance.imageKey = pick;
      try { console.log('generateRandomOrder special pick ->', { dayNumber, pick, orderId: order.id }); } catch (e) {}
          // mark so we don't repeat for the same day
          lastSpecialShownDay = dayNumber;
        }
      }
    }
  } catch (e) {}
  } catch (e) {}
  if (lastCustomerAppearanceId && order.appearance.id === lastCustomerAppearanceId) {
    // try a few times to get a different one
    for (let i = 0; i < 6 && order.appearance.id === lastCustomerAppearanceId; i++) {
      order.appearance = generateRandomAppearance();
    }
  }
  lastCustomerAppearanceId = order.appearance.id;
  return order;
}

// Receipt UI: small animated receipt at top-center visible only in Maker
function createReceiptUI(scene) {
  const gw = Math.floor(scene.sys.game.config.width);
  // place receipt to the right of the dayContainer with padding
  const dayW = (dayContainer && dayContainer.bg) ? 160 : 140;
  const startX = Math.floor(dayW + 24);
  // nudge the receipt slightly higher (smaller y) so it sits nearer the top
  receiptContainer = scene.add.container(startX, 6 + makerYOffset).setVisible(false);
  receiptContainer.setDepth(2000);
  // background panel (distinct pale cream)
  const panel = scene.add.graphics();
  panel.fillStyle(0xfffbdb, 1);
  // initial size; will be resized in updateReceipt to fit text
  // make the initial panel a bit taller so it visually appears larger by default
  panel.fillRoundedRect(0, 0, 260, 72, 10);
  panel.lineStyle(2, 0xf0d88a, 1);
  panel.strokeRoundedRect(0, 0, 260, 72, 10);
  receiptContainer.add(panel);
  receiptContainer.bg = panel;
  const title = scene.add.text(12, 8, 'Receipt', { font: 'bold 14px Poppins', fill: '#2b2b2b' });
  receiptContainer.add(title);
  // keep a reference so updateReceipt can size around both title and text
  receiptContainer.title = title;
  // constrain text area and enable wrapping (we also truncate long toppings in updateReceipt)
  receiptContainer.orderText = scene.add.text(12, 32, '', { font: 'bold 13px Poppins', fill: '#111', wordWrap: { width: 236, useAdvancedWrap: true } });
  receiptContainer.add(receiptContainer.orderText);
  // static receipt (no click/expand) — visibility controlled by updateReceipt
}

function updateReceipt(scene, order) {
  if (!receiptContainer) return;
  if (!order) {
    receiptContainer.setVisible(false);
    receiptContainer.orderText.setText('');
    receiptContainer._fullText = '';
    return;
  }
  // only visible in Maker
  receiptContainer.setVisible(currentScreen === 'maker');
  // if order has multiple drinks, list each on its own line without numeric prefixes
  if (order.drinks && Array.isArray(order.drinks)) {
    const lines = order.drinks.map(d => {
      const tops = (d.toppings || []).map(t => t.key).join(', ');
      const servedMark = d.served ? ' (served)' : '';
      return `${d.size.key} ${d.flavor.key}${tops ? ` | ${tops}` : ''}${servedMark}`;
    });
    const text = lines.join('\n');
    receiptContainer.orderText.setText(text);
    receiptContainer._fullText = text;
    // resize background to fit text
    try {
  const padding = 12;
  const titleH = (receiptContainer.title && receiptContainer.title.height) ? receiptContainer.title.height : 16;
  const gap = 6;
  const contentH = titleH + gap + receiptContainer.orderText.height;
  const w = Math.max(160, Math.max(receiptContainer.orderText.width, (receiptContainer.title && receiptContainer.title.width) ? receiptContainer.title.width : 0) + padding * 2);
  // increase minimum height so multi-line receipts are a bit taller and accommodate title
  const h = Math.max(56, contentH + padding * 2);
      receiptContainer.bg.clear();
      receiptContainer.bg.fillStyle(0xfffbdb, 1);
      receiptContainer.bg.fillRoundedRect(0, 0, w, h, 10);
      receiptContainer.bg.lineStyle(2, 0xf0d88a, 1);
      receiptContainer.bg.strokeRoundedRect(0, 0, w, h, 10);
  // position title and text with a small gap so they don't overlap
  receiptContainer.title.x = 12;
  receiptContainer.title.y = Math.floor(padding / 2);
  receiptContainer.orderText.x = 12;
  receiptContainer.orderText.y = Math.floor(receiptContainer.title.y + titleH + gap);
  // position receipt to the right of dayContainer, keeping some margin
  const marginLeft = 24;
  const dayWLocal = (dayContainer && dayContainer.bg) ? Math.max(140, dayContainer.bg.__width || 140) : 140;
  receiptContainer.x = Math.floor(dayWLocal + marginLeft);
    } catch (e) {}
    return;
  }
  // single-drink fallback
  receiptContainer.setVisible(currentScreen === 'maker');
  const tops = (order.toppings || []).map(t => t.key).join(', ');
  const maxTopsChars = 36;
  let topsDisplay = tops;
  if (tops && tops.length > maxTopsChars) topsDisplay = tops.slice(0, maxTopsChars - 3) + '...';
  const displayLine = `${order.size.key} | ${order.flavor.key}` + (topsDisplay ? ` | ${topsDisplay}` : '');
  receiptContainer.orderText.setText(displayLine);
  receiptContainer._fullText = `Size: ${order.size.key}\nFlavor: ${order.flavor.key}\nToppings: ${tops || 'None'}`;
  // resize background for single line
  try {
  const padding = 12;
  const titleH = (receiptContainer.title && receiptContainer.title.height) ? receiptContainer.title.height : 16;
  const gap = 6;
  const contentH = titleH + gap + receiptContainer.orderText.height;
  const w = Math.max(160, Math.max(receiptContainer.orderText.width, (receiptContainer.title && receiptContainer.title.width) ? receiptContainer.title.width : 0) + padding * 2);
  const h = Math.max(56, contentH + padding * 2);
    receiptContainer.bg.clear();
    receiptContainer.bg.fillStyle(0xfffbdb, 1);
    receiptContainer.bg.fillRoundedRect(0, 0, w, h, 10);
    receiptContainer.bg.lineStyle(2, 0xf0d88a, 1);
    receiptContainer.bg.strokeRoundedRect(0, 0, w, h, 10);
  const marginLeft = 24;
  const dayWLocal = (dayContainer && dayContainer.bg) ? Math.max(140, dayContainer.bg.__width || 140) : 140;
  receiptContainer.x = Math.floor(dayWLocal + marginLeft);
  // position title and text consistently
  receiptContainer.title.x = 12;
  receiptContainer.title.y = Math.floor(padding / 2);
  receiptContainer.orderText.x = 12;
  receiptContainer.orderText.y = Math.floor(receiptContainer.title.y + titleH + gap);
  } catch (e) {}
}

function generateRandomAppearance() {
  const id = Phaser.Utils.String.UUID();
  const skinTones = [0xffe0cc, 0xf2d6b3, 0xe0b38a, 0xc98b5b, 0x8a5a3b];
  const hairColors = [0x2b1b0f, 0x5a2d0c, 0xd79f59, 0x222222, 0xffffff, 0x663399];
  const shirtColors = [0x6fc1d8, 0x9bd67a, 0xffc9d1, 0xf0c969, 0xa6d393];
  const hairStyles = ['short','long','bun','mohawk','bald'];
  const accessories = ['glasses','hat','none','scarf'];
  return {
    id,
    skin: Phaser.Utils.Array.GetRandom(skinTones),
    hair: Phaser.Utils.Array.GetRandom(hairColors),
    shirt: Phaser.Utils.Array.GetRandom(shirtColors),
    hairStyle: Phaser.Utils.Array.GetRandom(hairStyles),
    accessory: Phaser.Utils.Array.GetRandom(accessories)
  };
}


function createOrdersUI(scene) {
  // Draw a speech-bubble UI that points to the customer avatar (on the right)
  const g = scene.add.graphics();
  // bubble metrics (positioned relative to ordersContainer)
  // move the bubble further right so the pointer aligns nearer the customer avatar
  const bubbleX = 150;
  const bubbleY = 100;
  const bubbleW = Math.max(260, ORDERS_PANEL_W - 80);
  const bubbleH = 160;
  // bubble body
  g.fillStyle(0xfffbdb, 1);
  g.fillRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 12);
  g.lineStyle(3, 0xf0d88a, 1);
  g.strokeRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 12);
  // pointer triangle: base flush with bubble's right edge (we'll store tip separately so it can be redrawn for villain)
  const tipY = bubbleY + Math.floor(bubbleH / 2);
  const bubbleRight = bubbleX + bubbleW;
  const bubbleTip = scene.add.graphics();
  bubbleTip.fillStyle(0xfffbdb, 1);
  bubbleTip.beginPath();
  bubbleTip.moveTo(bubbleRight, tipY - 20); // top base
  bubbleTip.lineTo(bubbleRight + 16, tipY); // tip
  bubbleTip.lineTo(bubbleRight, tipY + 10); // bottom base
  bubbleTip.closePath();
  bubbleTip.fillPath();
  // no stroke for the triangle so it appears flush with the bubble (filled only)
  ordersContainer.add(g);
  ordersContainer.add(bubbleTip);
  // store references so other code can reposition/redraw the triangle
  ordersContainer.bubbleG = g;
  ordersContainer.bubbleTip = bubbleTip;
  ordersContainer._bubble = { x: bubbleX, y: bubbleY, w: bubbleW, h: bubbleH, tipY };
  // orders text area inside the bubble (moved right to sit nearer the pointer)
  // list area positioned inside the bubble (keeps padding from the left edge)
  const listArea = scene.add.container(bubbleX + 28, bubbleY + 12);
  ordersContainer.add(listArea);
  ordersContainer.listArea = listArea;
  // store dims for positioning/logic
  ordersContainer._panelW = ORDERS_PANEL_W;
  ordersContainer._panelH = ORDERS_PANEL_H;
  // customer avatar removed — no in-Orders image used
  // recreate customer avatar image for Orders UI only
  try {
    // Prefer an order-specific imageKey when available, otherwise fall back to loaded textures
    let texKey = null;
    try { if (activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey) texKey = activeOrder.appearance.imageKey; } catch (e) {}
    if (!texKey) texKey = (scene.textures && scene.textures.exists && scene.textures.exists('customer1')) ? 'customer1' : ((scene.textures && scene.textures.exists && scene.textures.exists('customer1_raw')) ? 'customer1_raw' : null);
    if (texKey) {
      // enlarge and nudge the villain avatar (move up and left for villain)
      const isVillain = (texKey === 'villain' || texKey === 'Villain' || texKey === 'Villain1.png');
  // treat Fiona as a larger-than-normal story avatar
  const isFiona = (texKey === 'Fiona' || texKey === 'fiona' || texKey === 'Fiona.png');
  // Ian should be shown larger and slightly to the right
  const isIan = (texKey === 'Ian' || texKey === 'ian' || texKey === 'Ia1.png');
  // Debbie should be nudged up a little
  const isDebbie = (texKey === 'Debbie' || texKey === 'debbie' || texKey === 'Debbie.png');
      // Elena: make slightly larger and move left
      const isElena = (texKey === 'Elena' || texKey === 'elena' || texKey === 'Elena.png');
  // small adjustments for villain placement (pixels inside Orders panel)
  const villainOffsetX = -260; // move left more
  const villainOffsetY = -120; // move up a little more
  // move non-villain avatars further right so they sit nearer the edge; Fiona sits a bit closer than generic customers
  // position Fiona noticeably more to the left than normal customers so she sits closer to the center
      const avatarX = isVillain ? (ordersContainer._panelW - 30 + villainOffsetX) : (isFiona ? (ordersContainer._panelW - 100) : (isElena ? (ordersContainer._panelW - 60) : (isIan ? (ordersContainer._panelW + 160) : (ordersContainer._panelW + 120))));
      let avatarY = 34;
      if (isVillain) avatarY = 34 + villainOffsetY;
      else if (isDebbie) avatarY = 34 - 18; // move Debbie up a bit
  const avatar = scene.add.image(avatarX, avatarY, texKey).setOrigin(0.5, 0.5);
      try {
    // set avatar initial display size and prepare for appearance animation (fade-in)
      if (isVillain) avatar.setDisplaySize(200, 200);
        else if (isFiona) avatar.setDisplaySize(140, 140);
      else if (isElena) avatar.setDisplaySize(140, 140);
      else if (isIan) avatar.setDisplaySize(120, 120);
        else avatar.setDisplaySize(64, 64);
    avatar.setAlpha(0);
      } catch (e) { try { avatar.setScale(64 / Math.max(1, avatar.width || 64)); } catch (e) {} }
      avatar.setDepth(1500);
      ordersContainer.add(avatar);
      ordersContainer.avatar = avatar;
      avatar.setVisible(currentScreen === 'orders');
  // animate when this customer first appears (will be triggered from refreshOrdersUI)
  try { avatar._needsAppear = true; } catch (e) {}
      // debug info
      try { const tex = scene.textures.get(texKey); const src = (tex && tex.source && tex.source[0] && tex.source[0].image) ? tex.source[0].image : null; console.log('Customer avatar texture used:', texKey, src ? { width: src.width, height: src.height } : null); } catch (e) {}
    } else {
      // no texture loaded; do not draw a fallback
      try { console.warn('No customer avatar texture loaded (neither encoded nor raw).'); } catch (e) {}
    }
  } catch (e) {}
  // make a small counter for customers
  // (no customer hint or remove button)
}

// Animate the customer avatar (Phaser image in-orders and DOM overlay) when a new customer appears.
function animateCustomerAppearance(scene) {
  try {
    if (!scene || !ordersContainer) return;
    // animate canvas avatar
    try {
      const avatar = ordersContainer.avatar;
      if (avatar) {
        // Show avatar instantly without any arrival animation for all characters
        try {
          // reset any previous tweens
          scene.tweens.killTweensOf(avatar);
          const baseY = avatar.y;
          try { avatar.setAlpha(1); } catch (e) {}
          try { avatar.setScale(1); } catch (e) {}
          try { avatar.y = baseY; } catch (e) {}
        } catch (e) {}
        try { avatar._needsAppear = false; } catch (e) {}
      }
    } catch (e) {}
    // animate DOM overlay image if present
    try {
      const d = document.getElementById('domCustomerImg');
      if (d) {
        // Only animate the DOM portrait for Penelope; otherwise show instantly
        try {
          const key = (activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey) ? activeOrder.appearance.imageKey : (ordersContainer.avatar && ordersContainer.avatar.texture && ordersContainer.avatar.texture.key) || '';
          const isPenelope = (String(key).toLowerCase() === 'penelope' || String(key).toLowerCase() === 'penelope.png');
          if (isPenelope) {
            d.style.transition = 'transform 360ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease';
            d.style.transformOrigin = '50% 50%';
            d.style.opacity = '0';
            d.style.transform = 'scale(0.6)';
            // force reflow
            // eslint-disable-next-line no-unused-expressions
            d.offsetHeight;
            d.style.opacity = '1';
            d.style.transform = 'scale(1)';
          } else {
            // no animation: ensure visible and reset transform
            d.style.transition = '';
            d.style.transform = 'none';
            d.style.opacity = '1';
          }
        } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
  // add OTHU badge image on the right side of the Orders panel (hidden by default)
  try {
    if (!ordersContainer.othuImage && !ordersContainer._othuDomCreated) {
  // place relative to the orders panel: move the picture left a lot so it sits nearer the panel content
  // (this places the image inside/left of the panel area)
  const imgX = (ordersContainer._panelW || ORDERS_PANEL_W) - 420; // move OTHU left another 30px
  const imgY = -10; // move OTHU down 20px
      // prefer Phaser texture if it was loaded successfully
      try {
        const hasTex = scene.textures && scene.textures.exists && scene.textures.exists('OTHU');
        let texHasImage = false;
        if (hasTex) {
          try {
            const tex = scene.textures.get('OTHU');
            texHasImage = !!(tex && tex.source && tex.source[0] && tex.source[0].image && tex.source[0].image.width);
          } catch (e) { texHasImage = false; }
        }
        if (hasTex && texHasImage) {
          // Use the texture's original pixel dimensions but clamp to a maximum badge size.
          try {
            const MAX_BADGE = 100; // max dimension in px for badges
            const tex = scene.textures.get('OTHU');
            const srcImg = tex && tex.source && tex.source[0] && tex.source[0].image ? tex.source[0].image : null;
            const imgW = (srcImg && srcImg.width) ? srcImg.width : 140;
            const imgH = (srcImg && srcImg.height) ? srcImg.height : 140;
            const scale = Math.min(1, MAX_BADGE / Math.max(imgW || 1, imgH || 1));
            const dispW = Math.max(1, Math.round(imgW * scale));
            const dispH = Math.max(1, Math.round(imgH * scale));
            // draw a thin framed background behind the badge so it shows even when using Phaser textures
            try {
              const pad = 4;
              const fx = imgX - pad;
              const fy = imgY - pad;
              const fw = dispW + pad * 2;
              const fh = dispH + pad * 2;
              const f = scene.add.graphics();
              try { f.fillStyle(0xffffff, 1); f.fillRoundedRect(fx, fy, fw, fh, 6); } catch (e) {}
              try { f.lineStyle(1, 0xf8f4f0, 1); f.strokeRoundedRect(fx, fy, fw, fh, 6); } catch (e) {}
              f.setDepth(1199);
              f.setVisible(false);
              ordersContainer.add(f);
              ordersContainer.othuFrame = f;
            } catch (e) {}
            const othu = scene.add.image(imgX, imgY, 'OTHU').setOrigin(0, 0);
            try { othu.setDisplaySize(dispW, dispD || dispH); } catch (e) {}
            try { othu.setDisplaySize(dispW, dispH); } catch (e) {}
            othu.setDepth(1200);
            othu.setVisible(false);
            ordersContainer.add(othu);
            ordersContainer.othuImage = othu;
            // store clamped dimensions for DOM positioning
            ordersContainer._othuDomPos = { x: imgX, y: imgY, w: dispW, h: dispH };
          } catch (e) {
            const othu = scene.add.image(imgX, imgY, 'OTHU').setOrigin(0, 0);
            try { othu.setDisplaySize(120, 120); } catch (e) {}
            othu.setDepth(1200);
            othu.setVisible(false);
            ordersContainer.add(othu);
            ordersContainer.othuImage = othu;
            ordersContainer._othuDomPos = { x: imgX, y: imgY, w: 100, h: 100 };
          }
        } else {
          // Fallback: create a DOM <img> overlay positioned above the canvas
          const wrapperId = 'ordersOthuWrap';
          let wrap = document.getElementById(wrapperId);
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = wrapperId;
            wrap.style.position = 'fixed';
            wrap.style.zIndex = '9999';
            wrap.style.display = 'none';
            wrap.style.pointerEvents = 'auto';
            // frame-only styling: transparent background, visible border (tight to image)
            // frame styling to match ShamU persistent postcard
            wrap.style.background = '#fff';
            wrap.style.padding = '2px';
            wrap.style.borderRadius = '6px';
            wrap.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
            wrap.style.border = '1px solid #f8f4f0';
            wrap.style.overflow = 'visible';
            wrap.style.boxSizing = 'border-box';
            // inner img
            const dom = document.createElement('img');
            dom.id = 'ordersOthuImg';
            dom.src = './assets/OTHU.png';
            dom.style.display = 'block';
            // we'll size the img to the clamped dimensions (100% of wrapper)
            dom.style.width = '100%';
            dom.style.height = '100%';
            dom.style.objectFit = 'contain';
            dom.style.pointerEvents = 'auto';
            wrap.appendChild(dom);
            document.body.appendChild(wrap);
          }
          ordersContainer._othuDomCreated = true;
          try { window._orders_othu_persistent = true; } catch (e) {}
          // wrapper size will use the clamped dimensions by default (includes padding+border)
          ordersContainer._othuDomPos = { x: imgX, y: imgY, w: 100 + 2*2 + 1*2, h: 100 + 2*2 + 1*2 };
          ordersContainer._othuDom = wrap;
          // position now and on window resize
          const positionDom = () => {
            try {
              const canvas = scene.sys.game && scene.sys.game.canvas ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.clientWidth / (scene.sys.game.config.width || canvas.width || 1);
              const scaleY = canvas.clientHeight / (scene.sys.game.config.height || canvas.height || 1);
              const worldX = (ordersContainer.x || 0) + (ordersContainer._othuDomPos.x || 0);
              const worldY = (ordersContainer.y || 0) + (ordersContainer._othuDomPos.y || 0);
              const left = Math.round(rect.left + worldX * scaleX);
              const top = Math.round(rect.top + worldY * scaleY);
              wrap.style.left = left + 'px';
              wrap.style.top = top + 'px';
              wrap.style.width = Math.round((ordersContainer._othuDomPos.w || 84) * scaleX) + 'px';
              wrap.style.height = Math.round((ordersContainer._othuDomPos.h || 84) * scaleY) + 'px';
            } catch (e) {}
          };
          // store helper so updateOTHUVisibility can show/hide it
          ordersContainer._othuDom = wrap;
          try { positionDom(); } catch (e) {}
          try { window.addEventListener('resize', positionDom); } catch (e) {}
          // try to size wrapper to the natural image size to avoid cropping
          try {
            const MAX_BADGE = 100;
            const imgEl = wrap.querySelector('img#ordersOthuImg');
            if (imgEl) {
              const finalize = (iw, ih) => {
                const PAD = 2;
                const BORDER = 1;
                const scale = Math.min(1, MAX_BADGE / Math.max(iw || 1, ih || 1));
                const imgW = Math.max(1, Math.round(iw * scale));
                const imgH = Math.max(1, Math.round(ih * scale));
                const wrapperW = imgW + PAD * 2 + BORDER * 2;
                const wrapperH = imgH + PAD * 2 + BORDER * 2;
                wrap.style.width = wrapperW + 'px';
                wrap.style.height = wrapperH + 'px';
                ordersContainer._othuDomPos.w = wrapperW;
                ordersContainer._othuDomPos.h = wrapperH;
                try { positionDom(); } catch (e) {}
              };
              if (imgEl.complete && imgEl.naturalWidth) {
                finalize(imgEl.naturalWidth, imgEl.naturalHeight);
              } else {
                imgEl.addEventListener('load', () => {
                  try { finalize(imgEl.naturalWidth || imgEl.width || MAX_BADGE, imgEl.naturalHeight || imgEl.height || MAX_BADGE); } catch (e) {}
                }, { once: true });
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}
  // add TVDU badge (mirrors OTHU) — hidden by default
  try {
    if (!ordersContainer.tvduImage && !ordersContainer._tvduDomCreated) {
  // move TVDU further right and make it larger
  const tx = (ordersContainer._panelW || ORDERS_PANEL_W) - 215; // closer to right edge (moved further right)
      const ty = -25; // moved up 40px
      try {
        const hasTex = scene.textures && scene.textures.exists && scene.textures.exists('TVDU');
        let texHasImage = false;
        if (hasTex) {
          try {
            const tex = scene.textures.get('TVDU');
            texHasImage = !!(tex && tex.source && tex.source[0] && tex.source[0].image && tex.source[0].image.width);
          } catch (e) { texHasImage = false; }
        }
        if (hasTex && texHasImage) {
          try {
            const MAX_BADGE = 140; // reduced size for TVDU
            const tex = scene.textures.get('TVDU');
            const srcImg = tex && tex.source && tex.source[0] && tex.source[0].image ? tex.source[0].image : null;
            const imgW = (srcImg && srcImg.width) ? srcImg.width : 140;
            const imgH = (srcImg && srcImg.height) ? srcImg.height : 140;
            const scale = Math.min(1, MAX_BADGE / Math.max(imgW || 1, imgH || 1));
            const dispW = Math.max(1, Math.round(imgW * scale));
            const dispH = Math.max(1, Math.round(imgH * scale));
            const tvdu = scene.add.image(tx, ty, 'TVDU').setOrigin(0, 0);
            try { tvdu.setDisplaySize(dispW, dispH); } catch (e) {}
            tvdu.setDepth(1200);
            tvdu.setVisible(false);
            ordersContainer.add(tvdu);
            ordersContainer.tvduImage = tvdu;
            ordersContainer._tvduDomPos = { x: tx, y: ty, w: dispW, h: dispH };
            // add thin framed Phaser graphic behind TVDU as well
            try {
              const pad2 = 4;
              const fx2 = tx - pad2;
              const fy2 = ty - pad2;
              const fw2 = dispW + pad2 * 2;
              const fh2 = dispH + pad2 * 2;
              const gf = scene.add.graphics();
              try { gf.fillStyle(0xffffff, 1); gf.fillRoundedRect(fx2, fy2, fw2, fh2, 6); } catch (e) {}
              try { gf.lineStyle(1, 0xf8f4f0, 1); gf.strokeRoundedRect(fx2, fy2, fw2, fh2, 6); } catch (e) {}
              gf.setDepth(1199);
              gf.setVisible(false);
              ordersContainer.add(gf);
              ordersContainer.tvduFrame = gf;
            } catch (e) {}
          } catch (e) {
            const tvdu = scene.add.image(tx, ty, 'TVDU').setOrigin(0, 0);
            try { tvdu.setDisplaySize(120, 120); } catch (e) {}
            tvdu.setDepth(1200);
            tvdu.setVisible(false);
            ordersContainer.add(tvdu);
            ordersContainer.tvduImage = tvdu;
            ordersContainer._tvduDomPos = { x: tx, y: ty, w: 140, h: 140 };
          }
        } else {
          const wrapperId = 'ordersTvduWrap';
          let wrap = document.getElementById(wrapperId);
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = wrapperId;
            wrap.style.position = 'fixed';
            wrap.style.zIndex = '9999';
            wrap.style.display = 'none';
            wrap.style.pointerEvents = 'auto';
            // frame styling to match ShamU persistent postcard
            wrap.style.background = '#fff';
            wrap.style.padding = '2px';
            wrap.style.borderRadius = '6px';
            wrap.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
            wrap.style.border = '1px solid #f8f4f0';
            wrap.style.overflow = 'visible';
            wrap.style.boxSizing = 'border-box';
            const dom = document.createElement('img');
            dom.id = 'ordersTvduImg';
            dom.src = './assets/tvdbg.png';
            dom.style.display = 'block';
            dom.style.width = '100%';
            dom.style.height = '100%';
            dom.style.objectFit = 'contain';
            dom.style.pointerEvents = 'auto';
            wrap.appendChild(dom);
            document.body.appendChild(wrap);
          }
          ordersContainer._tvduDomCreated = true;
          try { window._orders_tvdu_persistent = true; } catch (e) {}
          // default wrapper size assumes 160px image + padding/border
          ordersContainer._tvduDomPos = { x: tx, y: ty, w: 140 + 2*2 + 1*2, h: 140 + 2*2 + 1*2 };
          ordersContainer._tvduDom = wrap;
          const positionDom = () => {
            try {
              const canvas = scene.sys.game && scene.sys.game.canvas ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.clientWidth / (scene.sys.game.config.width || canvas.width || 1);
              const scaleY = canvas.clientHeight / (scene.sys.game.config.height || canvas.height || 1);
              const worldX = (ordersContainer.x || 0) + (ordersContainer._tvduDomPos.x || 0);
              const worldY = (ordersContainer.y || 0) + (ordersContainer._tvduDomPos.y || 0);
              const left = Math.round(rect.left + worldX * scaleX);
              const top = Math.round(rect.top + worldY * scaleY);
              wrap.style.left = left + 'px';
              wrap.style.top = top + 'px';
              wrap.style.width = Math.round((ordersContainer._tvduDomPos.w || 112) * scaleX) + 'px';
              wrap.style.height = Math.round((ordersContainer._tvduDomPos.h || 112) * scaleY) + 'px';
            } catch (e) {}
          };
          try { positionDom(); } catch (e) {}
          try { window.addEventListener('resize', positionDom); } catch (e) {}
          // size wrapper to the natural image dimensions to avoid cropping
          try {
            const MAX_BADGE = 140;
            const imgEl = wrap.querySelector('img#ordersTvduImg');
            if (imgEl) {
              const finalize = (iw, ih) => {
                const PAD = 2;
                const BORDER = 1;
                const scale = Math.min(1, MAX_BADGE / Math.max(iw || 1, ih || 1));
                const imgW = Math.max(1, Math.round(iw * scale));
                const imgH = Math.max(1, Math.round(ih * scale));
                const wrapperW = imgW + PAD * 2 + BORDER * 2;
                const wrapperH = imgH + PAD * 2 + BORDER * 2;
                wrap.style.width = wrapperW + 'px';
                wrap.style.height = wrapperH + 'px';
                ordersContainer._tvduDomPos.w = wrapperW;
                ordersContainer._tvduDomPos.h = wrapperH;
                try { positionDom(); } catch (e) {}
              };
              if (imgEl.complete && imgEl.naturalWidth) {
                finalize(imgEl.naturalWidth, imgEl.naturalHeight);
              } else {
                imgEl.addEventListener('load', () => {
                  try { finalize(imgEl.naturalWidth || imgEl.width || MAX_BADGE, imgEl.naturalHeight || imgEl.height || MAX_BADGE); } catch (e) {}
                }, { once: true });
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}
  // add VDD badge (appears when unlocked via Callisto serve or PenelopeReturn finish)
  try {
    if (!ordersContainer.vddImage && !ordersContainer._vddDomCreated) {
  // move VDD further right and make it larger
  const vx = (ordersContainer._panelW || ORDERS_PANEL_W) - 360; // closer to right edge
      const vy = 200; // moved down 80px
      try {
        const hasTex = scene.textures && scene.textures.exists && scene.textures.exists('VDD');
        let texHasImage = false;
        if (hasTex) {
          try { const tex = scene.textures.get('VDD'); texHasImage = !!(tex && tex.source && tex.source[0] && tex.source[0].image && tex.source[0].image.width); } catch (e) { texHasImage = false; }
        }
        if (hasTex && texHasImage) {
          try {
            const MAX_BADGE = 200; // larger badge for VDD (allow upscaling)
            const tex = scene.textures.get('VDD');
            const srcImg = tex && tex.source && tex.source[0] && tex.source[0].image ? tex.source[0].image : null;
            const imgW = (srcImg && srcImg.width) ? srcImg.width : 140;
            const imgH = (srcImg && srcImg.height) ? srcImg.height : 140;
            // allow upscaling for small source images but cap at 2x to avoid excessive enlargement
            const scale = Math.min(2, MAX_BADGE / Math.max(imgW || 1, imgH || 1));
            const dispW = Math.max(1, Math.round(imgW * scale));
            const dispH = Math.max(1, Math.round(imgH * scale));
            // thin frame
            try {
              const pad = 4;
              const fx = vx - pad;
              const fy = vy - pad;
              const fw = dispW + pad * 2;
              const fh = dispH + pad * 2;
              const f = scene.add.graphics();
              try { f.fillStyle(0xffffff, 1); f.fillRoundedRect(fx, fy, fw, fh, 6); } catch (e) {}
              try { f.lineStyle(1, 0xf8f4f0, 1); f.strokeRoundedRect(fx, fy, fw, fh, 6); } catch (e) {}
              f.setDepth(1199);
              f.setVisible(false);
              ordersContainer.add(f);
              ordersContainer.vddFrame = f;
            } catch (e) {}
            const vimg = scene.add.image(vx, vy, 'VDD').setOrigin(0,0);
            try { vimg.setDisplaySize(dispW, dispH); } catch (e) {}
            vimg.setDepth(1200);
            vimg.setVisible(false);
            ordersContainer.add(vimg);
            ordersContainer.vddImage = vimg;
            ordersContainer._vddDomPos = { x: vx, y: vy, w: dispW, h: dispH };
          } catch (e) {
            const vimg = scene.add.image(vx, vy, 'VDD').setOrigin(0,0);
            try { vimg.setDisplaySize(200,200); } catch (e) {}
            vimg.setDepth(1200);
            vimg.setVisible(false);
            ordersContainer.add(vimg);
            ordersContainer.vddImage = vimg;
            ordersContainer._vddDomPos = { x: vx, y: vy, w: 200, h: 200 };
          }
        } else {
          const wrapperId = 'ordersVddWrap';
          let wrap = document.getElementById(wrapperId);
          if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = wrapperId;
            wrap.style.position = 'fixed';
            wrap.style.zIndex = '9999';
            wrap.style.display = 'none';
            wrap.style.pointerEvents = 'auto';
            wrap.style.background = '#fff';
            wrap.style.padding = '2px';
            wrap.style.borderRadius = '6px';
            wrap.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
            wrap.style.border = '1px solid #f8f4f0';
            wrap.style.overflow = 'visible';
            wrap.style.boxSizing = 'border-box';
            const dom = document.createElement('img');
            dom.id = 'ordersVddImg';
            dom.src = './assets/VDD.png';
            dom.style.display = 'block';
            dom.style.width = '100%';
            dom.style.height = '100%';
            dom.style.objectFit = 'contain';
            dom.style.pointerEvents = 'auto';
            wrap.appendChild(dom);
            document.body.appendChild(wrap);
          }
          ordersContainer._vddDomCreated = true;
          try { window._orders_vdd_persistent = true; } catch (e) {}
          // default wrapper size assumes 200px image + padding/border
          ordersContainer._vddDomPos = { x: vx, y: vy, w: 200 + 2*2 + 1*2, h: 200 + 2*2 + 1*2 };
          ordersContainer._vddDom = wrap;
          const positionDom = () => {
            try {
              const canvas = scene.sys.game && scene.sys.game.canvas ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.clientWidth / (scene.sys.game.config.width || canvas.width || 1);
              const scaleY = canvas.clientHeight / (scene.sys.game.config.height || canvas.height || 1);
              const worldX = (ordersContainer.x || 0) + (ordersContainer._vddDomPos.x || 0);
              const worldY = (ordersContainer.y || 0) + (ordersContainer._vddDomPos.y || 0);
              const left = Math.round(rect.left + worldX * scaleX);
              const top = Math.round(rect.top + worldY * scaleY);
              wrap.style.left = left + 'px';
              wrap.style.top = top + 'px';
              wrap.style.width = Math.round((ordersContainer._vddDomPos.w || 112) * scaleX) + 'px';
              wrap.style.height = Math.round((ordersContainer._vddDomPos.h || 112) * scaleY) + 'px';
            } catch (e) {}
          };
          try { positionDom(); } catch (e) {}
          try { window.addEventListener('resize', positionDom); } catch (e) {}
          try {
            const MAX_BADGE = 200; // match in-canvas target and allow upscaling
            const imgEl = wrap.querySelector('img#ordersVddImg');
            if (imgEl) {
              const finalize = (iw, ih) => {
                const PAD = 2;
                const BORDER = 1;
                // allow upscaling up to 2x for DOM fallback as well
                const scale = Math.min(2, MAX_BADGE / Math.max(iw || 1, ih || 1));
                const imgW = Math.max(1, Math.round(iw * scale));
                const imgH = Math.max(1, Math.round(ih * scale));
                const wrapperW = imgW + PAD * 2 + BORDER * 2;
                const wrapperH = imgH + PAD * 2 + BORDER * 2;
                wrap.style.width = wrapperW + 'px';
                wrap.style.height = wrapperH + 'px';
                ordersContainer._vddDomPos.w = wrapperW;
                ordersContainer._vddDomPos.h = wrapperH;
                try { positionDom(); } catch (e) {}
              };
              if (imgEl.complete && imgEl.naturalWidth) {
                finalize(imgEl.naturalWidth, imgEl.naturalHeight);
              } else {
                imgEl.addEventListener('load', () => { try { finalize(imgEl.naturalWidth || imgEl.width || MAX_BADGE, imgEl.naturalHeight || imgEl.height || MAX_BADGE); } catch (e) {} }, { once: true });
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function createShopUI(scene) {
  // build shop UI dynamically sized so it never covers the bottom nav
  shopContainer = scene.add.container(40, 80).setVisible(false);
  // Build shop catalog from master lists excluding items the player already owns
  const catalog = [];
  // Shop pricing: higher base prices and inflation per day
  const SHOP_HIGH_BASE = 80; // uniform, high price for all items
  const SHOP_DAY_INFLATION = 0.04; // +4% per day
  function computeShopPrice(base) {
    try {
      const dn = (typeof dayNumber === 'number' && dayNumber > 0) ? dayNumber : 1;
      const multiplier = 1 + (dn - 1) * SHOP_DAY_INFLATION;
      return Math.max(1, Math.ceil(base * multiplier));
    } catch (e) { return Math.max(1, Math.ceil(base)); }
  }
  try {
    const masterFlavors = window._BA_FLAVORS || [];
    const masterToppings = window._BA_TOPPINGS || [];
    // add flavors not owned yet (use uniform high base price)
    masterFlavors.forEach(f => {
      if (!ownedFlavors.some(of => of.key === f.key)) {
        catalog.push({ type: 'flavor', key: f.key, color: f.color, price: computeShopPrice(SHOP_HIGH_BASE) });
      }
    });
    // add toppings not owned yet (use same uniform high base price)
    masterToppings.forEach(t => {
      if (!ownedToppings.some(ot => ot.key === t.key)) {
        catalog.push({ type: 'topping', key: t.key, color: t.color, price: computeShopPrice(SHOP_HIGH_BASE) });
      }
    });
  } catch (e) {
    // fallback small catalog
    catalog.push({ type: 'flavor', key: 'Strawberry', color: 0xff97b7, price: computeShopPrice(SHOP_BASE_FLAVOR + 2) });
    catalog.push({ type: 'topping', key: 'Aloe', color: 0x9be6b8, price: computeShopPrice(SHOP_BASE_TOPPING + 1) });
  }

  // No per-row variation: all items use the uniform base (already computed)

  const panelX = 40;
  const panelY = 80;
  const shopW = 760; // expand to the right
  const slotH = 64;
  const startY = 56;
  const desiredH = startY + catalog.length * slotH + 24;

  // nav bar metrics (must match nav creation earlier)
  const navH = 48;
  const navMargin = 16;
  const maxShopH = Math.max(160, scene.sys.game.config.height - panelY - navH - navMargin - 24);
  const shopH = Math.min(desiredH, maxShopH);

  const g = scene.add.graphics();
  g.fillStyle(0xfffbf0, 1);
  g.fillRoundedRect(0, 0, shopW, shopH, 12);
  g.lineStyle(2, 0xe0c8a2, 1);
  g.strokeRoundedRect(0,0,shopW,shopH,12);
  shopContainer.add(g);
  const title = scene.add.text(18, 12, 'Shop', { font: 'bold 20px Poppins', fill: '#4a2f2f' });
  shopContainer.add(title);

  const slotW = shopW - 24; // padding
  // Create a content container that will be masked to allow scrolling
  const shopContent = scene.add.container(12, startY);
  shopContainer.add(shopContent);

  const contentHeight = catalog.length * slotH;
  const visibleHeight = shopH - startY - 12;
  const maxScroll = Math.max(0, contentHeight - visibleHeight);

  // populate shopContent with items at y= i*slotH
  catalog.forEach((item, i) => {
    const y = i * slotH;
    const slot = scene.add.rectangle(0, y, slotW, 52, 0xffffff).setStrokeStyle(1, 0xd8d8d8).setOrigin(0);
    // allow starting a drag from the slot row; buttons added after will be on top and clickable
    slot.setInteractive(new Phaser.Geom.Rectangle(0, 0, slotW, 52), Phaser.Geom.Rectangle.Contains);
    slot.on('pointerdown', (p) => {
      shopContainer._dragging = true;
      shopContainer._lastY = p.y;
    });
    shopContent.add(slot);
  const name = scene.add.text(16, y + 12, `${item.key} (${item.type})`, { font: 'bold 16px Poppins', fill: '#222' });
    shopContent.add(name);
  const price = scene.add.text(Math.floor(slotW * 0.6) - 12, y + 12, `$${item.price}`, { font: 'bold 16px Poppins', fill: '#2a7a3a' });
    shopContent.add(price);
    const buyBtnX = Math.floor(shopW - 96 - 64);
    // show price text or Owned label
    

  const buyBtn = styledButton(scene, buyBtnX, y + 10, 96, 34, 0x66bb6a, 'Buy', () => {
      if (money >= item.price) {
        money -= item.price;
        updateMoneyText(scene);
        // add to global flavor/topping lists so orders may request them
        if (item.type === 'flavor') {
          window._BA_FLAVORS.push({ key: item.key, color: item.color });
          // only add to ownedFlavors if not already present
          if (!ownedFlavors.some(f => f.key === item.key)) {
            ownedFlavors.push({ key: item.key, color: item.color });
            // create maker UI button for this new flavor at the end of the owned list
            addFlavorToMaker(scene, { key: item.key, color: item.color }, ownedFlavors.length - 1);
          }
        } else {
          window._BA_TOPPINGS.push({ key: item.key, color: item.color });
          if (!ownedToppings.some(t => t.key === item.key)) {
            ownedToppings.push({ key: item.key, color: item.color });
            // create maker UI button for this new topping at the end of the owned list
            addToppingToMaker(scene, { key: item.key, color: item.color }, ownedToppings.length - 1);
          }
        }
        // remove the shop row from the shopContent so it no longer appears
        try {
          slot.destroy();
        } catch (e) {}
        try { name.destroy(); } catch (e) {}
  try { price.destroy(); } catch (e) {}
        try { buyBtn.destroy(); } catch (e) {}
      }
    });
    shopContent.add(buyBtn);
  });

  // create mask for visible area using absolute coordinates
  const maskGraphics = scene.add.graphics();
  maskGraphics.fillStyle(0xffffff, 1);
  const maskX = 40 + 12; // shopContainer.x + content x
  const maskY = 80 + startY; // shopContainer.y + startY
  maskGraphics.fillRect(maskX, maskY, slotW, visibleHeight);
  maskGraphics.setVisible(false);
  const mask = maskGraphics.createGeometryMask();
  shopContent.setMask(mask);

  // scrolling state on shopContainer
  shopContainer._scrollY = 0;
  shopContainer._maxScroll = maxScroll;
  shopContainer._visibleHeight = visibleHeight;

  // drag handling: will be started by individual slot pointerdown handlers
  scene.input.on('pointerup', () => { shopContainer._dragging = false; });
  scene.input.on('pointermove', (p) => {
    if (!shopContainer.visible) return;
    if (shopContainer._dragging) {
      const dy = p.y - shopContainer._lastY;
      shopContainer._lastY = p.y;
      shopContainer._scrollY = Math.max(0, Math.min(shopContainer._maxScroll, shopContainer._scrollY - dy));
      shopContent.y = -shopContainer._scrollY;
    }
  });

  // wheel handling (only when pointer over shop area)
  scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
    if (!shopContainer.visible) return;
    const px = pointer.worldX;
    const py = pointer.worldY;
    if (px >= maskX && px <= maskX + slotW && py >= maskY && py <= maskY + visibleHeight) {
      shopContainer._scrollY = Math.max(0, Math.min(shopContainer._maxScroll, shopContainer._scrollY + deltaY * 0.5));
      shopContent.y = -shopContainer._scrollY;
    }
  });
}

function showShopScreen(scene) {
  currentScreen = 'shop';
  // ensure collection overlay is hidden and restore page background
  try { hideCollectionScreen(); hidePetScreen(); document.body.style.backgroundImage = "url('./assets/Background.png')"; } catch (e) {}
  shopContainer.setVisible(true);
  ordersContainer.setVisible(false);
  uiGroup.getChildren().forEach(ch => ch.setVisible(false));
  cupSprites.container.setVisible(false);
  if (cupSprites.infoText) cupSprites.infoText.setVisible(false);
  if (receiptContainer) receiptContainer.setVisible(false);
  try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
  // ensure OTHU visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.othuImage) ordersContainer.othuImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(false); } catch (e) {}
  try { const od = ordersContainer && ordersContainer._othuDom; if (od && !(window && window._orders_othu_persistent)) od.style.display = 'none'; } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function removeCustomer(scene) {
  // clear active customer and refresh UI
  activeOrder = null;
  currentOrderInMaker = null;
  customersEnabled = false;
  if (scene) refreshOrdersUI(scene);
  if (scene) updateReceipt(scene, null);
  try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
}

function refreshOrdersUI(scene) {
  const list = ordersContainer.listArea;
  list.removeAll(true);
  // no avatar area (customer visuals removed)
  if (!activeOrder) {
    const empty = scene.add.text(12, 8, 'No customers right now. Wait a moment...', { font: '14px Arial', fill: '#666' });
    list.add(empty);
  // no avatar drawn
    return;
  }
  const o = activeOrder;
  // ensure the Orders avatar texture and DOM overlay match the current activeOrder
  try {
    if (ordersContainer && ordersContainer.avatar && o && o.appearance && o.appearance.imageKey) {
      const key = o.appearance.imageKey;
      try {
        if (ordersContainer.avatar.texture && ordersContainer.avatar.texture.key !== key) {
          ordersContainer.avatar.setTexture(key);
        }
      } catch (e) {}
      try {
  if (key === 'villain') ordersContainer.avatar.setDisplaySize(200, 200);
        else ordersContainer.avatar.setDisplaySize(64, 64);
      } catch (e) {}
      try { ordersContainer.avatar.setVisible(currentScreen === 'orders'); } catch (e) {}
    }
  // reposition DOM customer image for the new activeOrder
  try { positionDomCustomerImg(scene); } catch (e) {}
  // NOTE: collection unlocks are handled on order/dialogue completion (not on appearance)
    // show a name tag for special, story characters, or the villain (Vera Chai)
    try {
      const key = (o && o.appearance && o.appearance.imageKey) ? o.appearance.imageKey : null;
      // base known special keys (OTH/TVD)
      let specialKeys = ['Lucas','Nathan','Haley','Peyton','Brooke','Stefan','Damon','Elena','Caroline','Bonnie','Callisto'];
      try {
        // also treat story character imageKeys (e.g. Penelope) as specials for name-tag display
        if (Array.isArray(storyCharacters)) {
          const sk = storyCharacters.map(s => s.imageKey).filter(Boolean);
          specialKeys = specialKeys.concat(sk);
        }
      } catch (e) {}
      // dedupe
      specialKeys = Array.from(new Set(specialKeys));
      const isSpecial = key && specialKeys.indexOf(key) !== -1;
      const isStoryChar = !!(o && o._isStory);
      const mustShow = (key === 'villain') || isSpecial || isStoryChar;
      if (mustShow) {
        // villain should display as Vera Chai
        let displayName = '';
        if (key === 'villain') {
          displayName = 'Vera Chai';
        } else if (isStoryChar && o._storyData) {
          // prefer the story's imageKey (friendly name) if present, fallback to story key
          displayName = o._storyData.imageKey || o._storyData.key || (key ? String(key) : '');
        } else {
          displayName = key ? String(key) : '';
        }
        // create a small name-tag (bg + text) if not present
        try {
          if (!ordersContainer.nameTag) {
            const txt = scene.add.text(0, 0, displayName, { font: 'bold 14px Poppins', fill: '#3b2b2b' });
            // create background based on text size and match bubble color + border
            const bg = scene.add.graphics();
            const bgColor = 0xfffbdb; // same as bubble
            const borderColor = 0xf0d88a; // bubble border
            bg.fillStyle(bgColor, 1);
            bg.fillRoundedRect(0, 0, txt.width + 12, txt.height + 8, 6);
            bg.lineStyle(2, borderColor, 1);
            bg.strokeRoundedRect(0, 0, txt.width + 12, txt.height + 8, 6);
            // position text inside bg
            txt.x = 6; txt.y = 4;
            const wrap = scene.add.container(0, 0, [bg, txt]);
            wrap.setDepth(3500);
            ordersContainer.add(wrap);
            ordersContainer.nameTag = wrap;
            ordersContainer.nameTag._bg = bg;
            ordersContainer.nameTag._txt = txt;
          } else {
            // update text and resize background
            try { ordersContainer.nameTag._txt.setText(displayName); } catch (e) {}
            try {
              const w = ordersContainer.nameTag._txt.width + 12;
              const h = ordersContainer.nameTag._txt.height + 8;
              const bgColor = 0xfffbdb;
              const borderColor = 0xf0d88a;
              ordersContainer.nameTag._bg.clear();
              ordersContainer.nameTag._bg.fillStyle(bgColor, 1);
              ordersContainer.nameTag._bg.fillRoundedRect(0, 0, w, h, 6);
              ordersContainer.nameTag._bg.lineStyle(2, borderColor, 1);
              ordersContainer.nameTag._bg.strokeRoundedRect(0, 0, w, h, 6);
            } catch (e) {}
          }
          // position above the bubble (centered) and nudge down slightly so it sits closer to the bubble
          try {
            const bb = ordersContainer._bubble || { x: 150, y: 100, w: 260, h: 160 };
            const nt = ordersContainer.nameTag;
            const nameTagOffsetX = -138; // large left shift
            const nx = Math.floor(bb.x + Math.max(8, (bb.w - (nt._txt.width + 12)) / 2) + nameTagOffsetX);
            const nameTagOffsetY = 8; // move the tag down a bit
            const ny = Math.floor(bb.y - (nt._txt.height + 15) + nameTagOffsetY);
            nt.x = nx; nt.y = ny;
            nt.setVisible(true);
          } catch (e) {}
        } catch (e) {}
      } else {
        try { if (ordersContainer && ordersContainer.nameTag) ordersContainer.nameTag.setVisible(false); } catch (e) {}
      }
    } catch (e) {}
    // run appearance animation once per customer AFTER the avatar/DOM have been updated
    try {
      if (o && !o._animated) {
        animateCustomerAppearance(scene);
        try { o._animated = true; } catch (e) {}
      }
    } catch (e) {}
    // if this is a story character (appears occasionally), trigger their dialogue sequence
    try {
  // only trigger story dialogue for orders that were explicitly scheduled for this day
  // and whose current avatar actually matches the story character image (prevents regular
  // customers that happen to use the same portrait from triggering story lines)
  if (o && o._isStory && o._storyData && !o._storyShown && o._scheduledDay === dayNumber && o.appearance && o.appearance.imageKey === o._storyData.imageKey) {
        try { o._storyShown = true; } catch (e) {}
        try { setVillainDialogue(o._storyData.dialogue, scene); villainDialogueOwnerImageKey = o.appearance.imageKey || null; } catch (e) {}
        try { villainDialogueOwnerStoryKey = (o._storyData && o._storyData.key) ? o._storyData.key : null; } catch (e) {}
        try {
          // only set the pending-unlock flag when this is Penelope's return dialogue (the second one)
          pendingUnlockVDDOnStoryEnd = (villainDialogueOwnerStoryKey === 'PenelopeReturn');
        } catch (e) { pendingUnlockVDDOnStoryEnd = false; }
      }
    } catch (e) {}
  } catch (e) {}
  // ensure OTHU badge visibility is updated whenever the Orders UI refreshes
  try { if (typeof updateOTHUVisibility === 'function') updateOTHUVisibility(); } catch (e) {}
  try { if (typeof updateTVDUVisibility === 'function') updateTVDUVisibility(); } catch (e) {}
  try { if (typeof updateVDDVisibility === 'function') updateVDDVisibility(); } catch (e) {}
  // If a dialogue sequence is active, show the current line in the bubble and allow click-to-advance
  // If a dialogue is active but the activeOrder avatar no longer matches the owner, stop it
  try {
    if (villainTalking && villainDialogueOwnerImageKey && (!o || !o.appearance || o.appearance.imageKey !== villainDialogueOwnerImageKey)) {
      // customer changed while dialog was active — cancel the dialog
      try { stopVillainDialogue(scene); } catch (e) {}
    }
  } catch (e) {}

  if (villainTalking && villainDialogue && villainDialogue.length > 0) {
    const raw = villainDialogue[villainDialogueIndex];
    // normalize: allow either string (assume Vera) or object { speaker, text }
    const item = (typeof raw === 'string') ? { speaker: 'vera', text: raw } : (raw || { speaker: 'narration', text: '' });
    const speaker = (item.speaker || '').toLowerCase();
    const text = item.text || '';

    // Hide name tag when the current speaker is 'you' so the player's lines don't show a name tag.
    try {
      if (speaker === 'you') {
        try { if (ordersContainer && ordersContainer.nameTag) ordersContainer.nameTag.setVisible(false); } catch (e) {}
      } else {
        try { if (ordersContainer && ordersContainer.nameTag) ordersContainer.nameTag.setVisible(true); } catch (e) {}
      }
    } catch (e) {}

  // style selection
  let style = { font: 'bold 15px Poppins', fill: '#3b2b2b', align: 'left', wordWrap: { width: 320, useAdvancedWrap: true } };
    if (speaker === 'narration') {
      style = { font: 'italic 15px Poppins', fill: '#333', wordWrap: { width: 360, useAdvancedWrap: true } };
    } else if (speaker === 'you') {
      style = { font: 'bold 15px Poppins', fill: '#1b5fa8', wordWrap: { width: 320, useAdvancedWrap: true } };
    } else if (speaker === 'vera' || speaker === 'verachai' || speaker === 'vera chai') {
      style = { font: 'bold 15px Poppins', fill: '#8b1b1b', wordWrap: { width: 320, useAdvancedWrap: true } };
    }

    // determine bubble inner dimensions and clamp the text wrap width so it fits
    try {
      const b = ordersContainer._bubble || { x:150, y:100, w:260, h:160, tipY: (100 + Math.floor(160/2)) };
      const paddingX = 28; // same as createOrdersUI listArea offset
      const paddingY = 12;
      const maxTextW = Math.max(120, b.w - paddingX - 28);
  // apply computed wrap width (cap to avoid long, stretched lines)
  const cap = 300;
  style.wordWrap.width = Math.min(cap, Math.min(style.wordWrap.width || cap, maxTextW));
      const mainLine = scene.add.text(0, 0, text, style);

      // if text is taller than bubble, enlarge bubble height and redraw its background
      const neededH = Math.ceil(mainLine.height + paddingY * 2);
      if (neededH > b.h) {
        const newH = Math.max(b.h, neededH);
        // redraw bubble body
        try {
          ordersContainer._bubble.h = newH;
          ordersContainer._bubble.tipY = b.y + Math.floor(newH / 2);
          if (ordersContainer.bubbleG) {
            ordersContainer.bubbleG.clear();
            ordersContainer.bubbleG.fillStyle(0xfffbdb, 1);
            ordersContainer.bubbleG.fillRoundedRect(b.x, b.y, b.w, newH, 12);
            ordersContainer.bubbleG.lineStyle(3, 0xf0d88a, 1);
            ordersContainer.bubbleG.strokeRoundedRect(b.x, b.y, b.w, newH, 12);
          }
        } catch (e) {}
      }

      // redraw the bubble tip depending on speaker: Vera -> right, You -> bottom, Narration -> hide tip
      try {
        const bb = ordersContainer._bubble || b;
        if (ordersContainer.bubbleTip) {
          ordersContainer.bubbleTip.clear();
          const tip = ordersContainer.bubbleTip;
          tip.fillStyle(0xfffbdb, 1);
          tip.beginPath();
          if (speaker === 'vera' || speaker === 'verachai' || speaker === 'vera chai') {
            // point to the right
            const bubbleRight = bb.x + bb.w;
            tip.moveTo(bubbleRight, bb.tipY - 20);
            tip.lineTo(bubbleRight + 16, bb.tipY);
            tip.lineTo(bubbleRight, bb.tipY + 10);
            tip.closePath();
            tip.fillPath();
          } else if (speaker === 'you') {
            // point down from the center bottom
            const cx = Math.floor(bb.x + bb.w / 2);
            const by = Math.floor(bb.y + bb.h);
            tip.moveTo(cx - 12, by);
            tip.lineTo(cx, by + 16);
            tip.lineTo(cx + 12, by);
            tip.closePath();
            tip.fillPath();
          } else {
            // narration: leave tip cleared (no triangle)
          }
        }
      } catch (e) {}

      // clickable area spans the bubble; size it to the bubble dims
      try {
        const bb = ordersContainer._bubble || b;
        const hitX = -paddingX;
        const hitY = -paddingY;
        const hitW = Math.max(120, bb.w + paddingX);
        const hitH = Math.max(48, bb.h + paddingY * 2);
        const hit = scene.add.rectangle(hitX, hitY, hitW, hitH, 0x000000, 0).setOrigin(0);
        hit.setInteractive(new Phaser.Geom.Rectangle(hitX, hitY, hitW, hitH), Phaser.Geom.Rectangle.Contains, true);
        hit.input.cursor = 'pointer';
        hit.on('pointerdown', () => { try { advanceVillainDialogue(scene); } catch (e) {} });
        list.add(hit);
      } catch (e) {}

      list.add(mainLine);
      return;
    } catch (e) {
      // fallback: keep previous behavior
      const mainLine = scene.add.text(0, 0, text, style);
      const hit = scene.add.rectangle(-40, -8, 560, 200, 0x000000, 0).setOrigin(0);
      hit.setInteractive(new Phaser.Geom.Rectangle(-40, -8, 560, 200), Phaser.Geom.Rectangle.Contains, true);
      hit.input.cursor = 'pointer';
      hit.on('pointerdown', () => { try { advanceVillainDialogue(scene); } catch (e) {} });
      list.add(hit);
      list.add(mainLine);
      return;
    }
    return;
  }
  // helper to format a single drink description
  const formatDrink = (d) => {
  const tops = (d.toppings || []).map(t => t.key);
  let toppingText = '';
  if (tops.length === 1) toppingText = ` with ${tops[0]}`;
  else if (tops.length === 2) toppingText = ` with ${tops[0]} and ${tops[1]}`;
  else if (tops.length > 2) toppingText = ` with ${tops.slice(0, -1).join(', ')}, and ${tops.slice(-1)}`;
  // choose 'a' or 'an' based on the size word (simple vowel heuristic)
  const aOrAn = (w) => { try { if (!w || !w.length) return 'a'; const c = w[0].toLowerCase(); return 'aeiou'.includes(c) ? 'an' : 'a'; } catch (e) { return 'a'; } };
  const article = aOrAn(d.size && d.size.key);
  return `${article} ${d.size.key} ${d.flavor.key}${toppingText}`;
  };

  // varied sentence templates to make customers sound different
  const templates = [
  (t) => `Hi! I'd like ${t}, please.`,
  (t) => `Could I get ${t}?`,
  (t) => `I'll have ${t}, please.`,
  (t) => `That'll be ${t}, please.`,
  (t) => `Can I order ${t}?`
  ];

  // Build the drink text: if multiple drinks, enumerate them; otherwise describe the single drink
  const drinkCount = (o.drinks && o.drinks.length) ? o.drinks.length : 1;
  let drinksText = '';
  if (drinkCount === 1) {
    const d = (o.drinks && o.drinks[0]) ? o.drinks[0] : { size: o.size, flavor: o.flavor, toppings: o.toppings };
    drinksText = formatDrink(d);
  } else {
  const parts = (o.drinks || []).map((d) => formatDrink(d));
  if (parts.length === 2) drinksText = parts.join(' and ');
  else drinksText = parts.slice(0, -1).join(', ') + ', and ' + parts.slice(-1);
  }

  const tmpl = templates[Phaser.Math.Between(0, templates.length - 1)];
  const sentence = tmpl(drinksText);
  // compute wrap width based on bubble inner width so text fits
  try {
    const b = ordersContainer._bubble || { x:150, y:100, w:260, h:160 };
    const paddingX = 28;
    const paddingY = 12;
    const maxTextW = Math.max(120, b.w - paddingX - 28);
  const style = { font: 'bold 15px Poppins', fill: '#3b2b2b', align: 'left', wordWrap: { width: Math.min(220, maxTextW), useAdvancedWrap: true } };
  const mainLine = scene.add.text(0, 0, sentence, style);
    // if text is taller than bubble, enlarge the bubble and redraw
    const neededH = Math.ceil(mainLine.height + paddingY * 2);
    if (neededH > b.h) {
      try {
        ordersContainer._bubble.h = neededH;
        ordersContainer._bubble.tipY = b.y + Math.floor(neededH / 2);
        if (ordersContainer.bubbleG) {
          ordersContainer.bubbleG.clear();
          ordersContainer.bubbleG.fillStyle(0xfffbdb, 1);
          ordersContainer.bubbleG.fillRoundedRect(b.x, b.y, b.w, neededH, 12);
          ordersContainer.bubbleG.lineStyle(3, 0xf0d88a, 1);
          ordersContainer.bubbleG.strokeRoundedRect(b.x, b.y, b.w, neededH, 12);
        }
      } catch (e) {}
    }
  // Non-interactive bubble for regular customer orders (clicking does nothing)
  const hitW = Math.max(120, b.w + paddingX);
  const hitH = Math.max(48, (ordersContainer._bubble.h || b.h) + paddingY * 2);
  const hit = scene.add.rectangle(-8, -8, hitW, hitH, 0x000000, 0).setOrigin(0);
  // intentionally do not call setInteractive on regular customer bubbles so they are not clickable
  list.add(hit);
    list.add(mainLine);
  } catch (e) {
  const mainLine = scene.add.text(0, 0, sentence, { font: 'bold 15px Poppins', fill: '#3b2b2b', wordWrap: { width: 240, useAdvancedWrap: true } });
  const hit = scene.add.rectangle(-8, -8, 260, 160, 0x000000, 0).setOrigin(0);
  // leave non-interactive in fallback as well
  list.add(hit);
  list.add(mainLine);
  }
}

// Start a sequence of villain dialogue lines. Call with an array of strings and the scene to immediately show Orders.
function setVillainDialogue(lines, scene) {
  try {
    if (!lines || !Array.isArray(lines) || lines.length === 0) return;
    villainDialogue = lines.slice();
    villainDialogueIndex = 0;
    villainTalking = true;
    // by default clear any previous owner; caller may set villainDialogueOwnerImageKey
    villainDialogueOwnerImageKey = null;
    // ensure Orders screen is shown so the player can click through
    if (scene) showOrdersScreen(scene);
    // refresh to render first line
    try { refreshOrdersUI(scene); } catch (e) {}
  } catch (e) {}
}

// Stop any active villain/dialogue sequence and remove overlays
function stopVillainDialogue(scene) {
  try {
    villainDialogue = null;
    villainDialogueIndex = 0;
    villainTalking = false;
    villainDialogueOwnerImageKey = null;
    // remove any pending dialog overlays
    try {
      const wrap = document.getElementById('dialogImageOverlayWrap') || document.getElementById('dialogVideoOverlayWrap');
      if (wrap) wrap.remove();
      try { window._boba_pendingDialogImageCallback = null; } catch (e) {}
      try { window._boba_pendingDialogVideoCallback = null; } catch (e) {}
      // if a video element is present, pause it
      try {
        const vid = document.querySelector('#dialogVideoOverlayWrap video');
        if (vid) { try { vid.pause(); vid.src = ''; } catch (e) {} }
      } catch (e) {}
    } catch (e) {}
    // restore DOM avatar visibility
    try { const d = document.getElementById('domCustomerImg'); if (d && currentScreen === 'orders') d.style.display = 'block'; } catch (e) {}
    // ensure customers can continue
    customersEnabled = true;
    // refresh UI
    try { if (scene) refreshOrdersUI(scene); } catch (e) {}
  } catch (e) {}
}

// Advance to the next villain dialogue line; when finished, stop villainTalking and spawn normal customers
function advanceVillainDialogue(scene) {
  try {
     const myAudio2 = document.getElementById('myAudio2');
     try {
         myAudio2.play().catch(error => {
              console.error("Audio play failed:", error);
         });
     } catch (e) {}
    if (!villainTalking) return;
    // if a dialog image is currently shown and waiting for click, handle that first
    try {
      // If an image or video overlay is pending (waiting for its own completion), remove it
      // and invoke its stored callback so we can safely advance the dialogue.
      if (window && (window._boba_pendingDialogImageCallback || window._boba_pendingDialogVideoCallback)) {
        try {
          // look for either overlay wrap id
          const wrap = document.getElementById('dialogImageOverlayWrap') || document.getElementById('dialogVideoOverlayWrap');
          if (wrap) {
            try { wrap.style.opacity = '0'; } catch (e) {}
            setTimeout(() => {
              try { wrap.remove(); } catch (e) {}
              try {
                const cb = window._boba_pendingDialogImageCallback || window._boba_pendingDialogVideoCallback;
                window._boba_pendingDialogImageCallback = null;
                window._boba_pendingDialogVideoCallback = null;
                if (typeof cb === 'function') { try { cb(); } catch (e) {} }
              } catch (e) {}
            }, 300);
            return;
          }
          // fallback: clear pending callbacks and continue (no overlay element found)
          try { window._boba_pendingDialogImageCallback = null; window._boba_pendingDialogVideoCallback = null; } catch (e) {}
        } catch (e) {}
      }
    } catch (e) {}
    // current line (do not advance yet)
    const cur = villainDialogue && villainDialogue[villainDialogueIndex];
    // If the current line has a showImage tag and we haven't shown it yet, show the image and wait for its click
    try {
      const curItem = (typeof cur === 'string') ? { speaker: 'vera', text: cur } : (cur || {});
      if (curItem && curItem.showVideo && !curItem._videoShown) {
        // show the dialog video and when it finishes, conditionally show Ty images only for Better.mp4
        showDialogVideo(curItem.showVideo, () => {
          try {
            const vidName = String(curItem.showVideo || '');
            if (vidName === 'Better.mp4') {
              try {
                showDialogImage('Ty.png', () => {
                  try {
                    showDialogImage('Ty3.png', () => {
                      try { curItem._videoShown = true; } catch (e) {}
                      try { advanceVillainDialogue(scene); } catch (e) {}
                    });
                  } catch (e) {
                    try { curItem._videoShown = true; } catch (e) {}
                    try { advanceVillainDialogue(scene); } catch (e) {}
                  }
                });
              } catch (e) {
                try { curItem._videoShown = true; } catch (e) {}
                try { advanceVillainDialogue(scene); } catch (e) {}
              }
            } else {
              // default: just advance after video
              try { curItem._videoShown = true; } catch (e) {}
              try { advanceVillainDialogue(scene); } catch (e) {}
            }
          } catch (e) {
            try { curItem._videoShown = true; } catch (e) {}
            try { advanceVillainDialogue(scene); } catch (e) {}
          }
        });
        return;
      }
      if (curItem && curItem.showImage && !curItem._imageShown) {
        // show the dialog image and on click advance to the next line
        showDialogImage(curItem.showImage, () => {
          try { curItem._imageShown = true; } catch (e) {}
          try { refreshOrdersUI(scene); } catch (e) {}
        });
        return;
      }
      // If the current line requests hiding the DOM customer image after click, do that now (then continue advancing)
      try {
        if (curItem && curItem.hideDomAfter && !curItem._domHidden) {
          try {
            const d = document.getElementById('domCustomerImg');
            if (d) {
              // fade out then hide so it feels smooth
              d.style.transition = 'opacity 180ms ease';
              d.style.opacity = '0';
              setTimeout(() => { try { d.style.display = 'none'; } catch (e) {} }, 200);
            }
          } catch (e) {}
          try { curItem._domHidden = true; } catch (e) {}
        }
      } catch (e) {}
    } catch (e) {}

    // default advance behavior when no image-interception is needed
    villainDialogueIndex++;
    if (!villainDialogue || villainDialogueIndex >= villainDialogue.length) {
      // done talking
      myAudio2.pause();
      myAudio2.currentTime = 0;
      
      villainDialogue = null;
      villainDialogueIndex = 0;
      villainTalking = false;
      // resume normal customers: enable customers and spawn next one
      customersEnabled = true;
  // mark the story/dialogue owner as collected when the sequence finishes
  try { if (villainDialogueOwnerImageKey) { try { markCharacterCollected(villainDialogueOwnerImageKey); } catch (e) {} } } catch (e) {}
            // If the finished story was Carl2 (day 33), show ShamU.png after the dialogue before resuming
            try {
              const isCarl2 = (dayNumber >= 33 && String(villainDialogueOwnerImageKey || '').toLowerCase().indexOf('carl') !== -1);
              if (isCarl2) {
                try {
                  // ensure Orders UI is visible, then show ShamU permanently (non-closing overlay)
                  try { showOrdersScreen(scene); } catch (e) {}
                  try { showPersistentImage('ShamU.png'); } catch (e) {}
                  if (typeof window !== 'undefined' && window._boba_enablePetNav) {
                    try { window._boba_enablePetNav(); } catch (e) {}
                  }
                  // resume normal flow
                  activeOrder = generateRandomOrder();
                  try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
                  try { refreshOrdersUI(scene); } catch (e) {}
                  // also restore DOM avatar visibility
                  try { const d = document.getElementById('domCustomerImg'); if (d && currentScreen === 'orders') d.style.display = 'block'; } catch (e) {}
                } catch (e) {}
                return;
              }
            } catch (e) {}
            // otherwise continue as before
      // Unlock VDD only if we explicitly set the pending unlock for PenelopeReturn
      try {
        if (pendingUnlockVDDOnStoryEnd) {
          vddPenelopeReturnCompleted = true;
          pendingUnlockVDDOnStoryEnd = false;
          try { ensureVddUnlockedIfReady(); } catch (e) {}
        }
      } catch (e) {}
      activeOrder = generateRandomOrder();
      
      const myAudio = document.getElementById('myAudio');
      myAudio.loop = true;
      myAudio.play().catch(error => {
          console.error("Audio play failed:", error);
      });
      
          try { if (activeOrder) activeOrder._animated = false; } catch (e) {}
          refreshOrdersUI(scene);
          // also restore DOM avatar visibility
          try { const d = document.getElementById('domCustomerImg'); if (d && currentScreen === 'orders') d.style.display = 'block'; } catch (e) {}
          return;
    }
    try { refreshOrdersUI(scene); } catch (e) {}
  } catch (e) {}
}

function showOrdersScreen(scene) {
  currentScreen = 'orders';
  // ensure collection overlay is hidden and restore page background
  try { hideCollectionScreen(); hidePetScreen(); document.body.style.backgroundImage = "url('./assets/Background.png')"; } catch (e) {}
  ordersContainer.setVisible(true);
  // ensure persistent postcard (ShamU) is visible when Orders is active
  try { const p = document.getElementById('persistentImageOverlay'); if (p) p.style.display = 'block'; } catch (e) {}
  // hide maker UI (container and controls): we'll hide uiGroup for simplicity
  uiGroup.getChildren().forEach(ch => ch.setVisible(false));
  cupSprites.container.setVisible(false);
  if (shopContainer) shopContainer.setVisible(false);
  if (cupSprites.infoText) cupSprites.infoText.setVisible(false);
  if (receiptContainer) receiptContainer.setVisible(false);
  // ensure DOM customer image is visible and positioned
  try { createDomCustomerImg(); positionDomCustomerImg(scene); const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'block'; } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function showMakerScreen(scene) {
  currentScreen = 'maker';
  // ensure collection overlay is hidden and restore page background
  try { hideCollectionScreen(); hidePetScreen(); document.body.style.backgroundImage = "url('./assets/Background.png')"; } catch (e) {}
  ordersContainer.setVisible(false);
  uiGroup.getChildren().forEach(ch => ch.setVisible(true));
  cupSprites.container.setVisible(true);
  if (shopContainer) shopContainer.setVisible(false);
  // restore the cup info text when returning to Maker
  if (cupSprites.infoText) cupSprites.infoText.setVisible(true);
  // hide any persistent postcard overlay when leaving Orders
  try { const p = document.getElementById('persistentImageOverlay'); if (p) p.style.display = 'none'; } catch (e) {}
  // ensure OTHU visuals are hidden when not on Orders
  try { if (ordersContainer && ordersContainer.othuImage) ordersContainer.othuImage.setVisible(false); } catch (e) {}
  try { if (ordersContainer && ordersContainer.othuFrame) ordersContainer.othuFrame.setVisible(false); } catch (e) {}
  try { const od = ordersContainer && ordersContainer._othuDom; if (od && !(window && window._orders_othu_persistent)) od.style.display = 'none'; } catch (e) {}
  // update receipt to reflect the loaded order if present, otherwise the active customer order
  updateReceipt(scene, currentOrderInMaker || activeOrder);
  // hide DOM customer image when not in Orders
  try { const d = document.getElementById('domCustomerImg'); if (d) d.style.display = 'none'; } catch (e) {}
  try { ensureOrdersBadgesVisibility(); } catch (e) {}
}

function loadOrderIntoMaker(scene, order) {
  // Load the first unserved drink from an order into the maker.
  if (!order) return;
  // find first unserved drink index
  const idx = (order.drinks || []).findIndex(d => !d.served);
  if (idx === -1) {
    // nothing to load
    return;
  }
  const drink = order.drinks[idx];
  selectedSize = drink.size;
  selectedFlavor = drink.flavor;
  toppings = [...(drink.toppings || [])];
  // set currentOrderInMaker as a reference to the parent order and which drink is loaded
  currentOrderInMaker = { parent: order, index: idx, drink };
  drawCup(scene);
  // switch to maker screen
  showMakerScreen(scene);
  // update the receipt to show the full order
  updateReceipt(scene, order);
}

// Compare the current made drink to an order. Size and flavor must match exactly.
// Toppings are treated as presence-only: each requested topping must appear at least once in the made drink.
// Compare a single drink object to the current maker selection
function drinkMatchesSelection(drink) {
  if (!drink) return false;
  if (!selectedSize || !selectedFlavor) return false;
  if (drink.size.key !== selectedSize.key) return false;
  if (drink.flavor.key !== selectedFlavor.key) return false;

  const norm = (s) => (s == null) ? '' : String(s).toLowerCase().trim();
  const toSet = (arr) => {
    const s = new Set();
    (arr || []).forEach(t => {
      const k = norm(t && t.key);
      if (k) s.add(k);
    });
    return s;
  };

  const orderSet = toSet(drink.toppings || []);
  const madeSet = toSet(toppings || []);
  // require exact set equality: any extra topping not requested makes the drink incorrect
  if (orderSet.size !== madeSet.size) return false;
  for (const k of orderSet) {
    if (!madeSet.has(k)) return false;
  }
  return true;
}

// Expose some functions to window for debugging/test
// calculate a simple reward: base by size + flavor bonus + per-topping
function calculateReward(order) {
  // calculate reward for a single drink object or for an order with a drinks array
  if (!order) return 0;
  const sizeBase = { 'Tiny': 2, 'Small': 4, 'Medium': 6, 'Large': 8 };
  // if order has drinks, sum per-drink rewards
  if (order.drinks && Array.isArray(order.drinks)) {
    return order.drinks.reduce((sum, d) => {
      const s = sizeBase[d.size && d.size.key] || 5;
      const t = (d.toppings || []).length * 1;
      return sum + s + t;
    }, 0);
  }
  // otherwise treat as single drink-like object
  const sizeVal = sizeBase[order.size && order.size.key] || 5;
  const toppingVal = (order.toppings || []).length * 1;
  return sizeVal + toppingVal;
}

function updateMoneyText(scene) {
  if (!moneyText) return;
  // Prevent money from going below zero
  try { money = (typeof money === 'number') ? Math.max(0, money) : 0; } catch (e) { money = 0; }
  moneyText.setText(`Money: $${money}`);
  try {
    // update bg size
    if (moneyBg && moneyText) {
      const newW = Math.max(80, moneyText.width + moneyHudPadding * 2);
      const newH = Math.max(28, moneyText.height + moneyHudPadding * 2);
      moneyBg.clear();
      moneyBg.fillStyle(0xfffbdb, 1);
      moneyBg.fillRoundedRect(0, 0, newW, newH, 8);
      moneyBg.lineStyle(2, 0xf0d88a, 1);
      moneyBg.strokeRoundedRect(0, 0, newW, newH, 8);
    }
    if (typeof positionMoneyText === 'function') positionMoneyText(scene);
  } catch (e) {}
}

// DOM helper: create a fixed <img> overlay for the customer so the real image can be shown
function createDomCustomerImg() {
  if (document.getElementById('domCustomerImg')) return;
  const img = document.createElement('img');
  img.id = 'domCustomerImg';
  // src will be set dynamically based on the active customer's chosen imageKey
  img.src = '';
  img.style.position = 'fixed';
  // keep the DOM image below the Phaser canvas so canvas UI remains visible and clickable
  img.style.zIndex = 0;
  img.style.pointerEvents = 'none';
  img.style.display = 'none';
  document.body.appendChild(img);
}

// Create a small DOM nav bar that mirrors the in-canvas bottom navigation so
// navigation remains visible and clickable when DOM overlays (like Collection)
// sit above the Phaser canvas. This only appears while the Collection UI is open.
function createDomNavButtons() {
  if (document.getElementById('domNavWrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'domNavWrap';
  wrap.style.position = 'fixed';
  wrap.style.left = '50%';
  // position a bit higher when buttons are larger
  // nudge DOM nav lower so it doesn't overlap Maker UI elements when overlays are shown
  wrap.style.bottom = (25 + makerYOffset) + 'px';
  wrap.style.transform = 'translateX(-50%)';
  wrap.style.display = 'flex';
  // match the in-canvas nav spacing
  wrap.style.gap = '20px';
  wrap.style.zIndex = '7000';
  wrap.style.pointerEvents = 'auto';
  // simple button factory to match existing nav labels
  const make = (label, bg, fn) => {
    // outer button container (matches styledButton size)
    const btn = document.createElement('div');
    btn.className = 'dom-nav-btn';
  // make buttons larger to match the bigger nav in other UIs
  btn.style.width = '300px';
  btn.style.height = '60px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.position = 'relative';
    btn.style.boxSizing = 'border-box';
    btn.style.background = bg;
    btn.style.borderRadius = '8px';
    btn.style.border = '2px solid #7a6f6f';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)';
    btn.style.overflow = 'hidden';
    // inner shine (subtle top highlight)
    const shine = document.createElement('div');
    shine.style.position = 'absolute';
  shine.style.left = '8px';
  shine.style.top = '8px';
  shine.style.right = '8px';
  shine.style.height = '22px';
    shine.style.background = 'rgba(255,255,255,0.12)';
    shine.style.borderRadius = '6px';
    shine.style.pointerEvents = 'none';
    btn.appendChild(shine);
    // label
  const span = document.createElement('span');
  span.textContent = label;
  // make the label occupy the full button box and vertically center using line-height
  span.style.display = 'inline-block';
  span.style.width = '100%';
  span.style.height = '64px';
  span.style.lineHeight = '64px';
  span.style.textAlign = 'center';
  // match the styledButton typography
  span.style.fontFamily = 'Poppins, sans-serif';
  span.style.fontWeight = '700';
  span.style.fontSize = '14px';
  span.style.color = '#ffffff';
  span.style.zIndex = '2';
  span.style.margin = '0';
  span.style.padding = '0';
  btn.appendChild(span);
    // subtle bottom stripe like the in-canvas nav stripe
    const stripe = document.createElement('div');
    stripe.style.position = 'absolute';
  stripe.style.left = '12px';
  stripe.style.right = '12px';
  stripe.style.bottom = '10px';
  stripe.style.height = '8px';
    stripe.style.background = 'rgba(255,255,255,0.06)';
    stripe.style.borderRadius = '4px';
    stripe.style.zIndex = '1';
    btn.appendChild(stripe);
    // click handler
    btn.addEventListener('click', () => { try { fn(window._boba_scene); } catch (e) {} });
    // hover effect: slight scale
    btn.addEventListener('mouseenter', () => { try { btn.style.transform = 'scale(1.04)'; btn.style.transition = 'transform 120ms'; } catch (e) {} });
    btn.addEventListener('mouseleave', () => { try { btn.style.transform = 'scale(1.0)'; } catch (e) {} });
    return btn;
  };
  // mirror the original colors used in styledButton nav creation
  wrap.appendChild(make('Shop', '#ffb86b', (s) => showShopScreen(s)));
  wrap.appendChild(make('Make', '#9bd67a', (s) => showMakerScreen(s)));
  wrap.appendChild(make('Orders', '#5daee8', (s) => showOrdersScreen(s)));
  wrap.appendChild(make('Collection', '#d39be8', (s) => showCollectionScreen(s)));
  // create Pet DOM nav button and keep a reference so we can enable it later when unlocked
  const petDomBtn = make('Pet', '#f2a6d9', (s) => { try { if (!petUnlocked) return; showPetScreen(s); } catch (e) {} });
  wrap.appendChild(petDomBtn);
  try { window._boba_petDomNavBtn = petDomBtn; } catch (e) {}
  try { if (!petUnlocked) { petDomBtn.style.opacity = '0.45'; petDomBtn.style.pointerEvents = 'none'; petDomBtn.style.cursor = 'default'; } } catch (e) {}
  document.body.appendChild(wrap);
}

function positionDomCustomerImg(scene) {
  const img = document.getElementById('domCustomerImg');
  if (!img) return;
  // find the Phaser canvas and compute scaling relative to game config
  const canvas = scene && scene.sys && scene.sys.game && scene.sys.game.canvas ? scene.sys.game.canvas : document.querySelector('#game-container canvas');
  if (!canvas) return;
  // ensure the canvas is above the DOM image so in-canvas UI (nav buttons) is visible/clickable
  try { canvas.style.zIndex = 2000; if (canvas.parentElement) canvas.parentElement.style.zIndex = 2000; } catch (e) {}
  const rect = canvas.getBoundingClientRect();
  const gw = scene.sys.game.config.width;
  const gh = scene.sys.game.config.height;
  const scaleX = rect.width / gw;
  const scaleY = rect.height / gh;
  const scale = Math.min(scaleX, scaleY);
  // Orders container is placed at (60,100) in game coords per create(); size of avatar 64x64
  const ordersX = 60; const ordersY = 100;
  // nudge DOM image further right for regular customers (villain stays left/bigger)
  const avatarOffsetX = ordersX + (ordersContainer && ordersContainer._panelW ? ordersContainer._panelW + (activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey === 'villain' ? -54 : 120) : 280);
  const avatarOffsetY = ordersY + 34;
  const px = Math.floor(rect.left + avatarOffsetX * scale);
  const py = Math.floor(rect.top + avatarOffsetY * scale);
  const baseSize = Math.floor(64 * domCustomerScaleMultiplier);
  const w = Math.max(32, Math.floor(baseSize * scale));
  // default placement
  let finalLeft = px + Math.floor(domCustomerOffsetX * scale);
  let finalTop = py + Math.floor(domCustomerOffsetY * scale);
  let finalW = w;
  // choose image source based on the currently active order appearance
  // choose image source based on the currently active order appearance
  try {
    const imgEl = document.getElementById('domCustomerImg');
    if (imgEl) {
      let src = './assets/Customer__1-removebg-preview.png';
      try {
        if (activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey) {
          const k = activeOrder.appearance.imageKey;
          const fname = CUSTOMER_ASSET_MAP[k] || CUSTOMER_ASSET_MAP[k.replace(/_raw$/, '')];
          if (fname) src = './assets/' + fname;
        }
      } catch (e) {}
      if (imgEl.src.indexOf(src) === -1) {
        try { console.log('positionDomCustomerImg setting DOM img src ->', { src, key: activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey, dayNumber }); } catch (e) {}
        imgEl.src = src;
      }
      // if villain or story character like Fiona, scale up DOM image and nudge (move up and left)
      try {
        const key = (activeOrder && activeOrder.appearance && activeOrder.appearance.imageKey) ? activeOrder.appearance.imageKey : '';
        if (key === 'villain') {
          const villainDomOffsetX = 110; // move left a bit
          const villainDomOffsetY = -10; // move up a bit
          finalW = Math.floor(w * 1);
          finalLeft = px + Math.floor((domCustomerOffsetX + 60 + villainDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + villainDomOffsetY) * scale);
        } else if (key === 'Fiona' || key === 'fiona') {
          // make Fiona noticeably larger in DOM overlay and nudge left so she sits closer to the canvas center
          const fionaDomOffsetX = -150; // negative to move left
          const fionaDomOffsetY = -30;
          finalW = Math.floor(w * 1.6);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + fionaDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + fionaDomOffsetY) * scale);
        } else if (key === 'Elena' || key === 'elena' || key === 'Elena.png') {
          // Elena: lar5ger and nudged left
          const elenaDomOffsetX = -160;
          const elenaDomOffsetY = 0;
          finalW = Math.floor(w * 1.4);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + elenaDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + elenaDomOffsetY) * scale);
        } else if (key === 'Caroline' || key === 'caroline' || key === 'Carol.png') {
          // Caroline: larger and nudged left
          const carolineDomOffsetX = -60;
          const carolineDomOffsetY = 0;
          finalW = Math.floor(w * 0.85);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + carolineDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + carolineDomOffsetY) * scale);
        } else if (key === 'Brooke' || key === 'brooke' || key === 'brooke.png') {
          // Brooke: larger and nudged left
          const brookeDomOffsetX = -170;
          const brookeDomOffsetY = -20;
          finalW = Math.floor(w * 1.6);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + brookeDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + brookeDomOffsetY) * scale);
        } else if (key === 'Damon' || key === 'damon' || key === 'Damon1.png') {
          // Damon: larger and nudged left
          const damonDomOffsetX = -100;
          const damonDomOffsetY = -50;
          finalW = Math.floor(w * 1.1);file:///home/qwerty/boba/index.html
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + damonDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + damonDomOffsetY) * scale);
        } else if (key === 'Stefan' || key === 'stefan' || key === 'St.png') {
          // Stefan: larger and nudged left
          const stefanDomOffsetX = -170;
          const stefanDomOffsetY = -40;
          finalW = Math.floor(w * 1.4);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + stefanDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + stefanDomOffsetY) * scale);
        } else if (key === 'Haley' || key === 'haley' || key === 'Halez.png') {
          // Haley: larger and nudged left
          const haleyDomOffsetX = -150;
          const haleyDomOffsetY = -20;
          finalW = Math.floor(w * 1.6);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + haleyDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + haleyDomOffsetY) * scale);
        } else if (key === 'Peyton' || key === 'peyton' || key === 'peyt.png') {
          // Peyton: larger and nudged left
          const peytonDomOffsetX = -140;
          const peytonDomOffsetY = -20;
          finalW = Math.floor(w * 1.4);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + peytonDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + peytonDomOffsetY) * scale);
        } else if (key === 'Bonnie' || key === 'bonnie' || key === 'Bonnie.png') {
          // Bonnie: larger and nudged left
          const bonnieDomOffsetX = -120;
          const bonnieDomOffsetY = -20;
          finalW = Math.floor(w * 1.15);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + bonnieDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + bonnieDomOffsetY) * scale);
        } else if (key === 'Lucas' || key === 'lucas' || key === 'Luc.png') {
          // Lucas: larger and nudged left
          const lucasDomOffsetX = -120;
          const lucasDomOffsetY = -20;
          finalW = Math.floor(w * 1.2);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + lucasDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + lucasDomOffsetY) * scale);
        } else if (key === 'Nathan' || key === 'nathan' || key === 'Nath.png') {
          // Nathan: larger and nudged left
          const nathanDomOffsetX = -120;
          const nathanDomOffsetY = -20;
          finalW = Math.floor(w * 1.4);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + nathanDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + nathanDomOffsetY) * scale);
        } else if (key === 'Callisto' || key === 'callisto' || key === 'Callisto.png') {
          // Callisto: larger and nudged left
          const callistoDomOffsetX = -70;
          const callistoDomOffsetY = -20;
          finalW = Math.floor(w * 1);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + callistoDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + callistoDomOffsetY) * scale);
        } else if (key === 'Ian' || key === 'ian' || key === 'Ia1.png') {
          // make Ian larger and nudge him to the right slightly
          const ianDomOffsetX = -140; // move right
          const ianDomOffsetY = -10; // move up a bit
          finalW = Math.floor(w * 1.6);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + ianDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + ianDomOffsetY) * scale);
        } else if (key === 'Debbie' || key === 'debbie' || key === 'Debbie.png') {
          // nudge Debbie's portrait up slightly
          const debbieDomOffsetX = 30;
          const debbieDomOffsetY = 0; // move up more than default
          finalW = Math.floor(w * 0.9);
          finalLeft = px + Math.floor((domCustomerOffsetX + debbieDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + debbieDomOffsetY) * scale);
        } else if (key === 'Liam' || key === 'liam' || key === 'Liam.png') {
          // Liam: larger and nudged left
          const liamDomOffsetX = -140;
          const liamDomOffsetY = -20;
          finalW = Math.floor(w * 1.5);
          finalLeft = px + Math.floor((domCustomerOffsetX + 40 + liamDomOffsetX) * scale);
          finalTop = py + Math.floor((domCustomerOffsetY + liamDomOffsetY) * scale);
        }
      } catch (e) {}
      imgEl.style.left = finalLeft + 'px';
      imgEl.style.top = finalTop + 'px';
      imgEl.style.width = finalW + 'px';
      imgEl.style.height = 'auto';
    }
  } catch (e) {}
}

// Show a dialog image overlay and call onClick when the image is clicked. The overlay will be removed after click.
function showDialogImage(filename, onClick) {
  try {
    if (!filename) return;
  // remove any existing overlay first and clear pending callback
  try { const old = document.getElementById('dialogImageOverlayWrap'); if (old) old.remove(); } catch (e) {}
  try { window._boba_pendingDialogImageCallback = null; } catch (e) {}

    // create a full-viewport cover so clicking anywhere closes the dialog
    const wrap = document.createElement('div');
    wrap.id = 'dialogImageOverlayWrap';
    wrap.style.position = 'fixed';
    wrap.style.left = '0';
    wrap.style.top = '0';
    wrap.style.width = '100vw';
    wrap.style.height = '100vh';
    wrap.style.zIndex = '99998';
    wrap.style.pointerEvents = 'auto';
    // subtle backdrop to focus the postcard
    wrap.style.background = 'rgba(0,0,0,0.28)';
  wrap.style.display = 'flex';
  wrap.style.justifyContent = 'center';
  // center vertically instead of pushing toward the top
  wrap.style.alignItems = 'center';
    wrap.style.boxSizing = 'border-box';
    wrap.style.opacity = '0';
    wrap.style.transition = 'opacity 260ms ease, transform 260ms ease';

    // postcard frame (centered inside the cover)
    const frame = document.createElement('div');
    frame.style.background = '#fff';
    frame.style.padding = '18px';
    frame.style.borderRadius = '10px';
    frame.style.boxShadow = '0 18px 50px rgba(0,0,0,0.45)';
    frame.style.border = '6px solid #f8f4f0';
  // keep the frame from growing too large; allow breathing room on small viewports
  frame.style.maxWidth = '70%';
    frame.style.boxSizing = 'border-box';

    // inner decorative border to simulate postcard mat
    const inner = document.createElement('div');
    inner.style.border = '1px solid #e7dfd6';
    inner.style.padding = '8px';
    inner.style.borderRadius = '6px';
    inner.style.background = '#fff';
    inner.style.display = 'inline-block';
    inner.style.boxSizing = 'border-box';
  // limit inner image area so the picture appears a bit smaller
  inner.style.maxWidth = '56vw';

    const imgEl = document.createElement('img');
    imgEl.id = 'dialogImageOverlay';
  imgEl.style.display = 'block';
  // shrink the rendered image a little so it reads like a postcard
  // make Ty images noticeably smaller for emphasis
  try {
    const lower = String(filename || '').toLowerCase();
    if (lower.indexOf('ty') !== -1) {
      imgEl.style.maxWidth = '28vw';
    } else {
      imgEl.style.maxWidth = '56vw';
    }
  } catch (e) { imgEl.style.maxWidth = '56vw'; }
    imgEl.style.height = 'auto';
    imgEl.style.cursor = 'pointer';
    imgEl.src = './assets/' + filename;

    inner.appendChild(imgEl);
    frame.appendChild(inner);
    wrap.appendChild(frame);
    document.body.appendChild(wrap);

  // store the onClick callback globally so other input (canvas clicks) can invoke it
  try { window._boba_pendingDialogImageCallback = onClick; } catch (e) {}
  // animate fade-in
  requestAnimationFrame(() => { wrap.style.opacity = '1'; });

    let closing = false;
    const closeHandler = () => {
      if (closing) return;
      closing = true;
      // fade out
      wrap.style.opacity = '0';
      // remove after transition
      setTimeout(() => {
        try { if (wrap) wrap.remove(); } catch (e) {}
        try { window._boba_pendingDialogImageCallback = null; } catch (e) {}
        try { if (typeof onClick === 'function') onClick(); } catch (e) {}
      }, 300);
    };

    // close when clicking anywhere on the cover (including the image)
    wrap.addEventListener('click', closeHandler, { once: true });
    // also keep image-specific listener as a fallback (still uses closing guard)
    imgEl.addEventListener('click', closeHandler, { once: true });
  } catch (e) {}
}

// Show a plain image overlay (no postcard/frame) centered on screen. Clicking closes it.
function showPlainImage(filename, onClick) {
  try {
    if (!filename) return;
    try { const old = document.getElementById('plainImageOverlay'); if (old) old.remove(); } catch (e) {}
    const wrap = document.createElement('div');
    wrap.id = 'plainImageOverlay';
    wrap.style.position = 'fixed';
    wrap.style.left = '0';
    wrap.style.top = '0';
    wrap.style.width = '100vw';
    wrap.style.height = '100vh';
    wrap.style.zIndex = '99999';
    wrap.style.pointerEvents = 'auto';
    // transparent backdrop (no white frame)
    wrap.style.background = 'rgba(0,0,0,0.0)';
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'center';
    wrap.style.alignItems = 'center';
    wrap.style.boxSizing = 'border-box';
    wrap.style.opacity = '0';
    wrap.style.transition = 'opacity 180ms ease, transform 180ms ease';

    const imgEl = document.createElement('img');
    imgEl.id = 'plainImageOverlayImg';
    imgEl.style.display = 'block';
  imgEl.style.maxWidth = '3vw';
  imgEl.style.maxHeight = '4vh';
    imgEl.style.height = 'auto';
    imgEl.style.cursor = 'pointer';
    imgEl.src = './assets/' + filename;

    wrap.appendChild(imgEl);
    document.body.appendChild(wrap);

    // fade in
    requestAnimationFrame(() => { wrap.style.opacity = '1'; });

    const close = () => {
      wrap.style.opacity = '0';
      setTimeout(() => { try { wrap.remove(); } catch (e) {} try { if (typeof onClick === 'function') onClick(); } catch (e) {} }, 180);
    };

    wrap.addEventListener('click', close, { once: true });
    imgEl.addEventListener('click', close, { once: true });
  } catch (e) {}
}

// Show a persistent image overlay (no close on click). Useful for permanent postcards that should remain visible.
function showPersistentImage(filename) {
  try {
  if (!filename) return;
  // ShamU.png should only appear in the Orders screen
  try { if ((filename === 'ShamU.png' || filename === 'Shameless' || filename === 'ShamU' || filename.indexOf('ShamU')!==-1) && typeof currentScreen !== 'undefined' && currentScreen !== 'orders') return; } catch (e) {}
    try { const old = document.getElementById('persistentImageOverlay'); if (old) old.remove(); } catch (e) {}
    const wrap = document.createElement('div');
    wrap.id = 'persistentImageOverlay';
    wrap.style.position = 'fixed';
  // move left by a lot (increase right) and move up slightly (increase bottom)
  // ShamU should be nudged slightly to the right compared to default persistent images
  try {
    if (filename && (filename === 'ShamU.png' || filename.indexOf('ShamU') !== -1 || filename === 'Shameless' || filename === 'ShamU')) {
  // nudge ShamU further left and up
  wrap.style.right = '1450px';
  wrap.style.bottom = '350px';
    } else {
      wrap.style.right = '1450px';
      wrap.style.bottom = '350px';
    }
  } catch (e) {
    wrap.style.right = '1450px';
    wrap.style.bottom = '350px';
  }
    wrap.style.zIndex = '99999';
    wrap.style.pointerEvents = 'auto';
    wrap.style.boxSizing = 'border-box';
    // create a small framed look so it reads like a pinned postcard
    wrap.style.background = '#fff';
    wrap.style.padding = '8px';
    wrap.style.borderRadius = '6px';
    wrap.style.boxShadow = '0 8px 30px rgba(0,0,0,0.35)';
  wrap.style.border = '2px solid #f8f4f0';
    const img = document.createElement('img');
    img.src = './assets/' + filename;
    img.style.display = 'block';
    img.style.width = 'auto';
    img.style.height = 'auto';
  img.style.maxWidth = '180px';
  img.style.maxHeight = '180px';
    img.style.objectFit = 'contain';
    wrap.appendChild(img);
    document.body.appendChild(wrap);
  } catch (e) {}
}

// Show two plain images side-by-side (no frame). Clicking closes the overlay.
function showPlainDoubleImage(filename, onClick) {
  try {
    if (!filename) return;
    try { const old = document.getElementById('plainImageOverlay'); if (old) old.remove(); } catch (e) {}
    const wrap = document.createElement('div');
    wrap.id = 'plainImageOverlay';
    wrap.style.position = 'fixed';
    wrap.style.left = '0';
    wrap.style.top = '0';
    wrap.style.width = '100vw';
    wrap.style.height = '100vh';
    wrap.style.zIndex = '99999';
    wrap.style.pointerEvents = 'auto';
    wrap.style.background = 'rgba(0,0,0,0.0)';
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'center';
    wrap.style.alignItems = 'center';
    wrap.style.boxSizing = 'border-box';
    wrap.style.opacity = '0';
    wrap.style.transition = 'opacity 180ms ease, transform 180ms ease';

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '12px';
    container.style.alignItems = 'center';

    const imgLeft = document.createElement('img');
    imgLeft.style.display = 'block';
    imgLeft.style.maxWidth = '32vw';
    imgLeft.style.maxHeight = '56vh';
    imgLeft.style.height = 'auto';
    imgLeft.style.cursor = 'pointer';
    imgLeft.src = './assets/' + filename;

    const imgRight = document.createElement('img');
    imgRight.style.display = 'block';
    imgRight.style.maxWidth = '32vw';
    imgRight.style.maxHeight = '56vh';
    imgRight.style.height = 'auto';
    imgRight.style.cursor = 'pointer';
    imgRight.src = './assets/' + filename;

    const imgBottomLeft = document.createElement('img');
    imgBottomLeft.style.display = 'block';
    imgBottomLeft.style.maxWidth = '32vw';
    imgBottomLeft.style.maxHeight = '56vh';
    imgBottomLeft.style.height = 'auto';
    imgBottomLeft.style.cursor = 'pointer';
    imgBottomLeft.src = './assets/' + filename;

    const imgBottomRight = document.createElement('img');
    imgBottomRight.style.display = 'block';
    imgBottomRight.style.maxWidth = '32vw';
    imgBottomRight.style.maxHeight = '56vh';
    imgBottomRight.style.height = 'auto';
    imgBottomRight.style.cursor = 'pointer';
    imgBottomRight.src = './assets/' + filename;

    container.appendChild(imgLeft);
    container.appendChild(imgRight);
    container.appendChild(imgBottomRight);
    container.appendChild(imgBottomLeft);
    wrap.appendChild(container);
    document.body.appendChild(wrap);

  requestAnimationFrame(() => { wrap.style.opacity = '1'; });
  // persist until cleared by serve action; store reference for removal later
  try { window._boba_double_overlay = wrap; } catch (e) {}
  } catch (e) {}
}

// Remove any extra Boba images added by the helper buttons or toppings.
function clearExtraBoba() {
  try {
    if (cupSprites && cupSprites.extraImages && Array.isArray(cupSprites.extraImages)) {
      cupSprites.extraImages.forEach(img => { try { if (img && img.destroy) img.destroy(); } catch (e) {} });
      cupSprites.extraImages = [];
    }
  } catch (e) {}
  try {
    const w = window._boba_double_overlay;
    if (w && w.remove) try { w.remove(); } catch (e) {};
    window._boba_double_overlay = null;
  } catch (e) {}
}

// Show a fullscreen dialog video overlay and call onFinish when the video ends or is clicked.
function showDialogVideo(filename, onFinish) {
  try {
    if (!filename) return;
    // remove any existing overlays
    try { const old = document.getElementById('dialogVideoOverlayWrap'); if (old) old.remove(); } catch (e) {}
    try { window._boba_pendingDialogVideoCallback = null; } catch (e) {}

    const wrap = document.createElement('div');
    wrap.id = 'dialogVideoOverlayWrap';
    wrap.style.position = 'fixed';
    wrap.style.left = '0';
    wrap.style.top = '0';
    wrap.style.width = '100vw';
    wrap.style.height = '100vh';
    wrap.style.zIndex = '99999';
    wrap.style.pointerEvents = 'auto';
    wrap.style.background = 'rgba(0,0,0,0.0)';
    wrap.style.display = 'flex';
    wrap.style.justifyContent = 'center';
    wrap.style.alignItems = 'center';
    wrap.style.boxSizing = 'border-box';
    wrap.style.opacity = '0';
    wrap.style.transition = 'opacity 260ms ease';

  const video = document.createElement('video');
    video.id = 'dialogVideoOverlay';
    video.src = './assets/' + filename;
    video.style.maxWidth = '100%';
    video.style.maxHeight = '100%';
    video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  // start invisible for a smooth fade-in when ready
  video.style.opacity = '0';
  video.style.transition = 'opacity 700ms ease';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // mute by default to avoid autoplay blocking
    video.controls = false;

    wrap.appendChild(video);
    document.body.appendChild(wrap);
    // store callback
    try { window._boba_pendingDialogVideoCallback = onFinish; } catch (e) {}
    // fade in overlay and wait for video to be ready before fading the video itself
    requestAnimationFrame(() => { wrap.style.opacity = '1'; });
    // slightly dim background when showing video
    wrap.style.background = 'rgba(0,0,0,0.28)';
    // when video can play, fade it in
    video.addEventListener('canplay', () => {
      try { video.play().catch(() => {}); } catch (e) {}
      requestAnimationFrame(() => { try { video.style.opacity = '1'; } catch (e) {} });
    });

    let finished = false;
    const cleanup = (invoke) => {
      if (finished) return;
      finished = true;
      try { wrap.style.opacity = '0'; } catch (e) {}
      setTimeout(() => {
        try { if (wrap) wrap.remove(); } catch (e) {}
        try { const cb = window._boba_pendingDialogVideoCallback; window._boba_pendingDialogVideoCallback = null; if (invoke && typeof cb === 'function') { try { cb(); } catch (e) {} } } catch (e) {}
      }, 300);
    };

    // end when video naturally ends
    video.addEventListener('ended', () => { cleanup(true); });
    // allow click to skip/close
    wrap.addEventListener('click', () => { cleanup(true); }, { once: true });
    // safety: if the video errors, just cleanup
    video.addEventListener('error', () => { cleanup(true); });
  } catch (e) {}
}

// Show a floating "+$N" animation centered over the Orders UI.
function showMoneyGain(scene, amount) {
  if (!scene || !amount) return;
  try {
    // Ensure Orders UI is visible for the animation
    if (currentScreen !== 'orders') {
      showOrdersScreen(scene);
    }
    const container = ordersContainer || { x: 60, y: 100 };
    // compute a start position moved down and nudged toward the middle
    const containerCenterX = (container.x || 60) + 280; // center of orders card area
    const sceneCenterX = Math.floor((scene.sys.game.config && scene.sys.game.config.width) ? scene.sys.game.config.width / 2 : window.innerWidth / 2);
    const startX = Math.floor(containerCenterX + (sceneCenterX - containerCenterX) * 0.5);
    const startY = (container.y || 100) + 180;

    // create the floating +$ text
    const txt = scene.add.text(startX, startY, `+$${amount}`, { font: 'bold 32px Poppins', fill: '#2a7a3a', stroke: '#ffffff', strokeThickness: 6 });
    txt.setOrigin(0.5);
    txt.setDepth(4000);
    // compute target at the money HUD (center of moneyText)
    let targetX = startX;
    let targetY = startY - 64;
    try {
      if (moneyText && moneyBg) {
        const curW = Math.max(80, moneyText.width + moneyHudPadding * 2);
        const curH = Math.max(28, moneyText.height + moneyHudPadding * 2);
        // moneyHudContainer.x is placed so the bg's right edge sits at gw - margin
        // target the center of the money HUD (toward the right)
        targetX = Math.floor(moneyHudContainer.x + curW / 2);
        targetY = Math.floor(moneyHudContainer.y + curH / 2);
      }
    } catch (e) {}

    // initial pop animation then fly to money HUD
    scene.tweens.add({
      targets: txt,
      scale: 1.12,
      duration: 160,
      ease: 'Back.easeOut',
      yoyo: true,
      onComplete: () => {
        scene.tweens.add({
          targets: txt,
          x: targetX,
          y: targetY,
          alpha: 0,
          scale: 0.75,
          ease: 'Cubic.easeIn',
          duration: 900,
          onComplete: () => { try { txt.destroy(); } catch (e) {} }
        });
      }
    });
  } catch (e) {
    // ignore animation errors
  }
}

function showMoneyLoss(scene, amount) {
  if (!scene || !amount) return;
  try {
    if (currentScreen !== 'orders') {
      showOrdersScreen(scene);
    }
    const container = ordersContainer || { x: 60, y: 100 };
    const containerCenterX = (container.x || 60) + 280;
    const sceneCenterX = Math.floor((scene.sys.game.config && scene.sys.game.config.width) ? scene.sys.game.config.width / 2 : window.innerWidth / 2);
    const startX = Math.floor(containerCenterX + (sceneCenterX - containerCenterX) * 0.5);
    const startY = (container.y || 100) + 180;
    const txt = scene.add.text(startX, startY, `-$${amount}`, { font: 'bold 32px Poppins', fill: '#b31212', stroke: '#ffffff', strokeThickness: 6 });
    txt.setOrigin(0.5);
    txt.setDepth(4000);
    let targetX = startX;
    let targetY = startY - 64;
    try {
      if (moneyText && moneyBg) {
        const curW = Math.max(80, moneyText.width + moneyHudPadding * 2);
        const curH = Math.max(28, moneyText.height + moneyHudPadding * 2);
        targetX = Math.floor(moneyHudContainer.x + curW / 2);
        targetY = Math.floor(moneyHudContainer.y + curH / 2);
      }
    } catch (e) {}
    scene.tweens.add({
      targets: txt,
      scale: 1.12,
      duration: 160,
      ease: 'Back.easeOut',
      yoyo: true,
      onComplete: () => {
        scene.tweens.add({
          targets: txt,
          x: targetX,
          y: targetY,
          alpha: 0,
          scale: 0.75,
          ease: 'Cubic.easeIn',
          duration: 900,
          onComplete: () => { try { txt.destroy(); } catch (e) {} }
        });
      }
    });
  } catch (e) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', function() {

/*
        const playButton = document.getElementById('menuPlayBtn');
        const myAudio = document.getElementById('myAudio');

        playButton.addEventListener('click', function() {
            myAudio.play().catch(error => {
                console.error("Audio play failed:", error);
            });
        });
*/        
    });

window._boba = { reset, selectSize, selectFlavor, addTopping, orderMatchesDrink, removeCustomer, customersEnabled, getMoney: () => money, addMoney: (n) => { money += n; updateMoneyText(); }, startNextDay: (s) => startNextDay(s), getDayNumber: () => dayNumber };
