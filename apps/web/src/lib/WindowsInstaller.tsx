"use client";
import {useEffect,useState} from "react";
import catalog from "../../../windows-helper/catalog.json";
import "./windows-installer.css";
type Bundle={file:string;sha256:string;bytes:number};
export default function WindowsInstaller(){
 const [selected,setSelected]=useState<string[]>(["codex"]),[bundles,setBundles]=useState<Record<string,Bundle>>({}),[error,setError]=useState("");
 useEffect(()=>{let live=true;fetch("/downloads/windows/manifest.json").then(r=>{if(!r.ok)throw new Error("暂时无法获取安装助手，请刷新重试");return r.json();}).then(data=>{if(live)setBundles(data.packages);}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[]);
 const key=catalog.filter(t=>selected.includes(t.key)).map(t=>t.key).join("-"),bundle=bundles[key];
 return <section className="windowsInstaller" aria-label="Windows 安装助手">
 <h2>Windows 一键安装助手</h2><p>选择工具，下载并解压助手，双击 Start.cmd。在本地确认后开始安装。</p>
 <div className="aiGrid">{catalog.map(tool=><article className="portalPanel" key={tool.key}>
 <label className="windowsTool"><input type="checkbox" checked={selected.includes(tool.key)} onChange={e=>setSelected(old=>e.target.checked?[...old,tool.key]:old.filter(k=>k!==tool.key))}/><strong>{tool.name}</strong></label>
 <p>{tool.architectures.includes("arm64")?"x64 / ARM64":"仅 x64"} · 安装版本 {tool.version}</p>
 <a href={tool.docs} target="_blank" rel="noopener noreferrer">官方安装与配置指引 ↗</a>
 </article>)}</div>
 {error&&<p role="alert">{error}</p>}
 <div className="aiActions">{bundle?<a className="windowsDownload" href={"/downloads/windows/"+bundle.file} download>下载 Windows 助手（已选 {selected.length} 项）</a>:<button disabled>{selected.length?"正在准备下载…":"请先选择工具"}</button>}</div>
 <p>支持 Windows 10 2004+ / Windows 11，需要 WinGet 1.12+。缺少时，助手会引导你前往微软官方页面。</p>
 <details><summary>安装、账号与安全</summary>
 <p>助手会保留已有工具，不自动升级或改写模型配置。安装过程中可能出现系统授权提示；可停止后续任务，当前安装不会被强制中断。</p>
 <p>账号登录和 API 密钥在对应工具本地配置，学镜不接收密钥。安装成功不代表服务免费或你的账号具有使用权限。</p>
 <p>本预览版尚未签名；若 Windows 或组织策略阻止运行，请先核实来源或联系管理员，不要关闭安全防护。任务记录保存在本机，不会上传。</p>
 <p>卸载工具请使用 Windows“已安装的应用”；删除助手解压目录不会删除已安装工具。</p>
 {bundle&&<p className="windowsHash">下载包 SHA-256：{bundle.sha256}</p>}
 </details>
 </section>;
}
