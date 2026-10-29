// Même tracé utilisé pour construire la chaussée et guider les poids lourds.
export const FLAG_PARKING={x:8,z:17};
export function truckRoad(x,z){
  const qx=Math.abs(x+20)-10,qz=Math.abs(z+5)-30;
  const distance=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-10;
  return Math.abs(distance)<=5;
}
export const flagParking=(x,z)=>x>=4&&x<=12&&z>=10&&z<=24;
const segments=[
  {length:60,point:d=>({x:0,z:-35+d,dx:0,dz:1})},
  {length:Math.PI*5,point:d=>arc(-10,25,d/10)},
  {length:20,point:d=>({x:-10-d,z:35,dx:-1,dz:0})},
  {length:Math.PI*5,point:d=>arc(-30,25,Math.PI/2+d/10)},
  {length:60,point:d=>({x:-40,z:25-d,dx:0,dz:-1})},
  {length:Math.PI*5,point:d=>arc(-30,-35,Math.PI+d/10)},
  {length:20,point:d=>({x:-30+d,z:-45,dx:1,dz:0})},
  {length:Math.PI*5,point:d=>arc(-10,-35,Math.PI*1.5+d/10)}
];
function arc(x,z,a){return{x:x+10*Math.cos(a),z:z+10*Math.sin(a),dx:-Math.sin(a),dz:Math.cos(a)}}
export const TRUCK_ROUTE_LENGTH=segments.reduce((sum,s)=>sum+s.length,0);
export function truckRoute(distance){
  let d=((distance%TRUCK_ROUTE_LENGTH)+TRUCK_ROUTE_LENGTH)%TRUCK_ROUTE_LENGTH;
  for(const segment of segments){if(d<segment.length)return segment.point(d);d-=segment.length}
  return segments[0].point(0);
}
