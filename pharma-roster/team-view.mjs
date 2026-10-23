export function mergeRemoteDraft(previous,incoming,draft,notes){
 const source={...draft},nextNotes={...notes};for(const d of new Set([...Object.keys(previous.source||{}),...Object.keys(incoming.source||{}),...Object.keys(previous.notes||{}),...Object.keys(incoming.notes||{})])){
  if(previous.source?.[d]!==incoming.source?.[d]||previous.notes?.[d]!==incoming.notes?.[d]){if(incoming.source?.[d])source[d]=incoming.source[d];else delete source[d];if(incoming.notes?.[d])nextNotes[d]=incoming.notes[d];else delete nextNotes[d];}
 }
 return{source,notes:nextNotes,dirty:JSON.stringify(source)!==JSON.stringify(incoming.source||{})||JSON.stringify(nextNotes)!==JSON.stringify(incoming.notes||{})};
}
