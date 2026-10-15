import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "学镜学习空间 Learning Mirror",
  description: "面向大学数理课程的学习与作业平台",
  applicationName: "学镜学习空间",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true,statusBarStyle:"default",title:"学镜学习空间"},
};

export const viewport: Viewport = {
  width:"device-width",
  initialScale:1,
  viewportFit:"cover",
  themeColor:"#eef2f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const icpNumber = process.env.NEXT_PUBLIC_ICP_NUMBER?.trim();
  const publicSecurityNumber = process.env.NEXT_PUBLIC_PUBLIC_SECURITY_NUMBER?.trim();
  const publicSecurityUrl = process.env.NEXT_PUBLIC_PUBLIC_SECURITY_URL?.trim();

  return (
    <html lang="zh-CN">
      <body>
        {children}
        {(icpNumber || publicSecurityNumber) && (
          <footer className="complianceFooter">
            {icpNumber && (
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
                {icpNumber}
              </a>
            )}
            {publicSecurityNumber && publicSecurityUrl && (
              <a href={publicSecurityUrl} target="_blank" rel="noreferrer">
                {publicSecurityNumber}
              </a>
            )}
          </footer>
        )}
      </body>
    </html>
  );
}
