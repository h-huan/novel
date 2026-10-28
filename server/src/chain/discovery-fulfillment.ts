/** Delivery slots are bounded by the user's request, never by the number of
 * independently vetted or fully generated candidate cards. */
export function missingRequestedIdeaSlots(slotIds:readonly string[],acceptedIds:ReadonlySet<string>,requestedCount:number):string[] {
  return slotIds.filter(id=>!!id&&!acceptedIds.has(id)).slice(0,Math.max(0,requestedCount-acceptedIds.size));
}
