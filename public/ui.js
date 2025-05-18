const uiInit = () => {
  // depth設定
  document.querySelectorAll('[data-z]').forEach(el => el.style.setProperty('--tz', el.getAttribute('data-z') + 'px'));
  // 星生成
  const starsEl = document.getElementById('stars');
  for(let i=0;i<200;i++){
    const s = document.createElement('div'); s.className = 'star';
    s.style.left = Math.random()*100 + '%';
    s.style.top  = Math.random()*100 + '%';
    s.style.transform = 'translateZ(' + (-Math.random()*6000) + 'px)';
    starsEl.appendChild(s);
  }
  // シーンスクロール
  const world = document.getElementById('world');
  window.addEventListener('scroll',()=>{
    world.style.transform = 'translateZ(' + window.scrollY + 'px)';
  },{passive:true});
};

document.addEventListener('DOMContentLoaded', uiInit);