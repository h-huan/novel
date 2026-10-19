import { DISCOVERY_TAG_GROUPS } from '@novel/shared';
import { dictionaryDiscoveryTags } from './discoveryTagOptions';
const tags = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : typeof value === 'string' ? value.split(/[·,，、]/).map(v=>v.trim()).filter(Boolean) : [];
/** Same group projection and hierarchy as discovery, with author-selected order preserved. */
export function creativeChoiceBadgeGroups(value: any): Array<[string, string[]]> {
 const chosen={selectedGenres:tags(value.webNovelGenre),selectedPlotTags:tags(value.plotTags),selectedTones:tags(value.storyTone),selectedSubmissionTags:tags(value.submissionTags)};
 const projected=dictionaryDiscoveryTags([],chosen);
 const result:Array<[string,string[]]>=[];
 const category=tags(value.storyCategory ?? value.category);if(category.length)result.push(['分类',category]);
 for(const group of DISCOVERY_TAG_GROUPS){const values=projected.filter(option=>option.group===group.key).map(option=>option.label);if(values.length)result.push([group.label,values]);}
 const style=tags(value.writingStyle);if(style.length)result.push(['文风',style]);
 const pov=tags(value.pov);if(pov.length)result.push(['视角',pov]);return result;
}
