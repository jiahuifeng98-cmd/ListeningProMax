import {it,expect} from 'vitest';
import {courseTitle,searchCourses} from '../src/shared/lessonCatalog';
it('课程名去边缘空格，拒绝空白、控制符和过长标题',()=>{expect(courseTitle('  2026.07（N1）  ')).toBe('2026.07（N1）');for(const bad of ['',null,12,' \t ','标题\n第二行','a'.repeat(101)])expect(()=>courseTitle(bad)).toThrow();expect(courseTitle('名'.repeat(100))).toHaveLength(100);});
it('搜索兼容大小写、全半角和多个乱序关键词，不改变原排序',()=>{const lessons=[{title:'2026.07（Ｎ１）'},{title:'2017.12（N2）'},{title:'Podcast · 日常会話'}];expect(searchCourses(lessons,'n1 2026')).toEqual([lessons[0]]);expect(searchCourses(lessons,'ＰＯＤＣＡＳＴ')).toEqual([lessons[2]]);expect(searchCourses(lessons,'  ')).toBe(lessons);expect(searchCourses(lessons,'N3')).toEqual([]);});
