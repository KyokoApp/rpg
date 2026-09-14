// Pose targets relative to the supplied rig's bind pose, in radians.
// Every driven joint gets a target every frame so attacks cannot leave limbs stuck.
export function samplePose({phase, time, move, run, dash, airborne, falling, attack, combo=0}) {
  const pose={};
  const put=(name,x=0,y=0,z=0)=>{pose[name]=[x,y,z];};
  const breath=Math.sin(time*1.8)*.022;
  put('PELVIS', .10*run+.36*dash, Math.sin(phase)*.055*move, Math.sin(phase)*.035*move);
  put('BELLY',breath-.04*run,0,-Math.sin(phase)*.022*move);
  put('CHEST',breath*.6, -Math.sin(phase)*.13*move,0);
  put('NECK',-.045*run); put('HEAD',-.025*run,Math.sin(time*.55)*.035*(1-move));
  for(const [side,offset,sign] of [['R',0,1],['L',Math.PI,-1]]){
    const swing=Math.sin(phase+offset), lift=Math.max(0,-swing);
    put('THIGH'+side,swing*(.40+.27*run+.15*dash)*move,0,sign*.018*move);
    put('KNEE'+side,(.10+.78*lift*lift)*move);
    put('LOWLEG'+side,-.08*lift*move);
    put('FOOT'+side,(-swing*.20-lift*.15)*move);
    put('TOE'+side,Math.max(0,swing)*.16*move);
    put('SHOULDER'+side,-swing*.09*move,0,sign*.035*move);
    put('ARM'+side,-swing*(.30+.15*run)*move,0,sign*.06);
    put('FOREARM'+side,.12+.35*run+.10*lift*move);
    put('HAND'+side,0,0,sign*.04);
    put('KNUCLE'+side,side==='R'?.48:.12);
    if(airborne){
      put('THIGH'+side,falling?.14:.38+offset*.035);
      put('KNEE'+side,falling?.26:.68);
      put('FOOT'+side,-.18); put('TOE'+side,.05);
      put('ARM'+side,-.20,0,sign*.20);
      put('FOREARM'+side,.35);
    }
  }
  // Carry the weapon with a relaxed elbow rather than sweeping it behind the back.
  pose.ARMR[0]-=.12; pose.FOREARMR[0]+=.18;
  if(attack!==null){
    const t=Math.max(0,Math.min(1,attack));
    const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const wind=smooth(t/.26), cut=smooth((t-.26)/.22), recover=smooth((t-.60)/.40);
    const arc=(wind-2*cut)*(1-recover), direction=combo%2===0?1:-1;
    const vertical=combo===2;
    put('PELVIS',.07,arc*.32*direction);
    put('BELLY',.04,arc*.18*direction);
    put('CHEST',.10,arc*.55*direction);
    put('SHOULDERR',-.18,arc*.25*direction,-.12);
    put('ARMR',vertical?-1.25*arc:-.35-.65*cut*(1-recover),arc*.9*direction,-.22-arc*.55);
    put('FOREARMR',.4+.55*wind*(1-cut));
    put('HANDR',-.12,arc*.22,0);
    put('ARML',.10,0,.18); put('FOREARML',.30);
    put('THIGHR',-.12*(1-recover));put('THIGHL',.16*(1-recover));
    put('KNEER',.18*(1-recover));put('KNEEL',.23*(1-recover));
  }
  return pose;
}
export function damp(current,target,rate,dt){return current+(target-current)*(1-Math.exp(-rate*dt));}
export function joystickAxis(x,y,radius=55,deadzone=.14){
  const length=Math.hypot(x,y)/radius;
  if(length<=deadzone)return {x:0,y:0};
  const amount=Math.min(1,(length-deadzone)/(1-deadzone));
  return {x:x/(length*radius)*amount,y:y/(length*radius)*amount};
}
