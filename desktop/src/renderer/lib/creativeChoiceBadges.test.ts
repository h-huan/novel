import {describe,it,expect} from 'vitest';
import {DISCOVERY_TAG_GROUPS} from '@novel/shared';
import {creativeChoiceBadgeGroups} from './creativeChoiceBadges';
describe('creative choice badge hierarchy',()=>{
 it('uses discovery group order and retains the selected source values',()=>{
  const settings={storyCategory:'女性成长',webNovelGenre:['扮猪吃虎','系统流','都市战神'],storyTone:['紧张','热血'],plotTags:['逆袭','打脸回报'],writingStyle:['写实','简洁利落'],pov:'第一人称'};
  const before=JSON.stringify(settings),groups=creativeChoiceBadgeGroups(settings);
  const labels=groups.map(([label])=>label);
  expect(labels[0]).toBe('分类');expect(labels.slice(-2)).toEqual(['文风','视角']);
  expect(labels.slice(1,-2)).toEqual(DISCOVERY_TAG_GROUPS.map(g=>g.label).filter(label=>labels.includes(label)));
  expect(labels).not.toContain('情绪氛围');expect(JSON.stringify(settings)).toBe(before);
  expect(groups.flatMap(([,values])=>values)).toContain('都市战神');
 });
 it('displays one optional choice without adding other tags',()=>{
  expect(creativeChoiceBadgeGroups({writingStyle:['白描朴素'],pov:'第一人称'})).toEqual([['文风',['白描朴素']],['视角',['第一人称']]]);
 });
});
