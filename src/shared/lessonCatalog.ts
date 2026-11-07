export function courseTitle(value:unknown):string{
  if(typeof value!=='string')throw Error('请输入课程名称');
  const title=value.trim();
  if(!title)throw Error('课程名称不能为空');
  if(title.length>100)throw Error('课程名称最多 100 个字符');
  if(/[\u0000-\u001f\u007f]/.test(title))throw Error('课程名称不能包含换行或控制字符');
  return title;
}
export function searchCourses<T extends {title:string}>(courses:T[],query:string):T[]{
  const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase();
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  return terms.length?courses.filter(course=>terms.every(term=>normalize(course.title).includes(term))):courses;
}
