// Rayon de chargement adapté au choix du joueur et aux capacités de l'appareil.
const BUDGET_RADIUS = Object.freeze({economy:1,standard:2,extended:3,maximum:5});
const clampInteger=(value,min,max,fallback)=>{
 const number=Number(value);
 return Number.isFinite(number)?Math.max(min,Math.min(max,Math.round(number))):fallback;
};

export function resolveViewBudget(settings={},hardware={}){
 const requestedRadius=clampInteger(settings.viewDistance,1,5,2);
 const profile=Object.hasOwn(BUDGET_RADIUS,settings.mapBudget)?settings.mapBudget:'standard';
 const memoryGB=Number.isFinite(Number(hardware.deviceMemory))&&Number(hardware.deviceMemory)>0
  ?Number(hardware.deviceMemory)
  :(hardware.coarse?4:8);
 const hardwareMaxRadius=memoryGB<=2?2:memoryGB<=4||hardware.coarse?3:5;
 const budgetMaxRadius=BUDGET_RADIUS[profile];
 const radius=Math.min(requestedRadius,budgetMaxRadius,hardwareMaxRadius);
 return{
  profile,requestedRadius,budgetMaxRadius,hardwareMaxRadius,radius,
  chunks:(radius*2+1)**2,
  blocksAcross:(radius*2+1)*16,
  limitedByBudget:requestedRadius>budgetMaxRadius,
  limitedByHardware:requestedRadius>hardwareMaxRadius
 };
}

export const VIEW_BUDGETS=BUDGET_RADIUS;
