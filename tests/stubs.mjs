const ctx2d = () => ({
  createRadialGradient:()=>({addColorStop(){}}), createLinearGradient:()=>({addColorStop(){}}),
  fillRect(){}, fill(){}, stroke(){}, beginPath(){}, closePath(){}, arc(){}, moveTo(){}, lineTo(){},
  quadraticCurveTo(){}, save(){}, restore(){}, translate(){}, rotate(){}, scale(){}, drawImage(){},
  set fillStyle(v){}, set strokeStyle(v){}, set lineWidth(v){}, set shadowColor(v){}, set shadowBlur(v){},
  set globalAlpha(v){}, set font(v){}, set textAlign(v){}, fillText(){},
});
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = { createElement(t){ if(t!=='canvas') return {style:{}};
  return { width:64, height:64, style:{}, getContext:ctx2d, addEventListener(){}, }; } };
try{Object.defineProperty(globalThis,'navigator',{value:{userAgent:'node'},configurable:true});}catch(e){}
globalThis.matchMedia = ()=>({matches:false, addEventListener(){}});
globalThis.addEventListener = ()=>{};
globalThis.requestAnimationFrame = ()=>0;
