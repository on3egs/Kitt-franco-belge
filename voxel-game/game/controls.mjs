// Convention Three.js : la caméra regarde vers -Z, sa droite suit +X.
export function movementVector(yaw,forward,strafe){
  const length=Math.max(1,Math.hypot(forward,strafe));
  return {x:(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)/length,z:(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)/length};
}
export const headingTo=(dx,dz)=>Math.atan2(-dx,-dz);
