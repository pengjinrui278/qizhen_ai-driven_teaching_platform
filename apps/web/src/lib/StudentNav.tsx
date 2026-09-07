type StudentNavProps = {
  active: "home" | "course" | "ai";
};

const links = [
  { href: "/student", id: "home" as const, label: "学生首页" },
  { href: "/student/course", id: "course" as const, label: "课程教学" },
  { href: "/student/ai", id: "ai" as const, label: "AI 教学" },
];

export default function StudentNav({ active }: StudentNavProps) {
  return (
    <nav className="studentNav" aria-label="学生端导航">
      <a href="/" className="studentBrand">
        学镜
      </a>
      <div className="studentNavLinks">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className={link.id === active ? "studentNavLink active" : "studentNavLink"}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
