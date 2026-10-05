import Link from "next/link";
import StudentIcon from "./StudentIcon";

export const studentNav=[["","学习首页","home"],["learn","课程学习","message"],["ai","AI 学习","spark"],["resources","资源中心","library"],["assignments","我的作业","file"],["observations","学习反馈","chart"],["privacy","档案与隐私","shield"]];

export default function StudentSidebar({section,href,role,demo,onLogout,loggingOut=false}:{section:string;href:(section?:string)=>string;role?:string;demo:boolean;onLogout?:()=>void;loggingOut?:boolean}){
 return <aside className="lmStudentSidebar">
  <Link href={href()} className="lmStudentLogo" aria-label="学镜学习空间首页"><span className="lmLogoMark" aria-hidden="true">镜</span><span className="lmSidebarLabel">学镜学习空间<span className="lmLogoEnglish">Learning Mirror</span></span></Link>
  <nav aria-label="学生端导航">{studentNav.map(([key,label,icon])=><Link key={key} href={href(key)} aria-label={label} title={label} aria-current={(section===key||(key==='ai'&&section.startsWith('ai/')))?'page':undefined}><StudentIcon name={icon}/><span className="lmSidebarLabel">{label}</span></Link>)}</nav>
  <div className="lmSidebarFooter">
   {(role==='teacher'||role==='ta')&&<Link href={'/teacher?mode='+(demo?'demo':'live')} aria-label="切换到教师端" title="切换到教师端"><StudentIcon name="switch"/><span className="lmSidebarLabel">切换到教师端</span></Link>}
   {demo?<Link href={'/student'+(section?'/'+section:'')+'?mode=live'} aria-label="登录" title="登录"><StudentIcon name="logout"/><span className="lmSidebarLabel">登录</span></Link>:onLogout&&<button type="button" onClick={onLogout} disabled={loggingOut} aria-label="退出登录" title="退出登录"><StudentIcon name="logout"/><span className="lmSidebarLabel">{loggingOut?'正在退出…':'退出登录'}</span></button>}
  </div>
 </aside>;
}
