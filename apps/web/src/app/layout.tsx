import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "学镜 Learning Mirror",
  description: "面向大学数理课程的学习与作业平台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
