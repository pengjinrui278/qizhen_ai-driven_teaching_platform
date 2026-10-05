// Inline line icons matching the approved B reference; labels belong to their controls.
export default function StudentIcon({name}:{name:string}){
 const paths:Record<string,string>={
 home:"M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
 person:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
 search:"M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  message:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  library:"M12 7v14M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v16h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z",
  file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 12h8M8 16h6",
  chart:"M3 12h4l3-8 4 16 3-8h4",
  shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  spark:"m12 3-2.5 6.5L3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5z",
  arrow:"M5 12h14m-6-6 6 6-6 6",
  switch:"M17 3l4 4-4 4M21 7H7M7 21l-4-4 4-4M3 17h14",
  logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  menu:"M4 6h16M4 12h16M4 18h16",
  close:"M6 6l12 12M6 18 18 6",
  up:"m6 12 6-6 6 6M12 6v14",
  camera:"M14 4h-4L8 7H3v13h18V7h-5zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  send:"m22 2-7 20-4-9-9-4zM22 2 11 13",
  download:"M21 15v5H3v-5M7 10l5 5 5-5M12 15V3",
 };
 return <svg className="lmIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]||paths.library}/></svg>;
}
