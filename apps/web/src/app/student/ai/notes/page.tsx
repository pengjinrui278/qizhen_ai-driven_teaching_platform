"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

// 笔记已并入「我的笔记」知识库，这里只做跳转，保留旧链接可达。
export default function AiNotesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/student/notes"); }, [router]);
  return <main className="loginPage"><p role="status">笔记已移到「我的笔记」，正在跳转…</p></main>;
}
