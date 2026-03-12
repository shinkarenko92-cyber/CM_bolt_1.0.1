import { Building2, Mail, ExternalLink } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const handleScroll = (href: string) => {
  const id = href.replace('#', '');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

export const Footer = () => {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4">
        <FadeIn>
          <div className="grid md:grid-cols-4 gap-10 py-14">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 gradient-hero rounded-xl flex items-center justify-center shadow-sm">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold font-display">Roomi</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Канальный менеджер нового поколения для эффективного управления апартаментами
              </p>
              <a
                href="mailto:hello@roomi.pro"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Mail className="w-4 h-4" />
                hello@roomi.pro
              </a>
            </div>

            {/* Продукт */}
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Продукт</h3>
              <ul className="space-y-3 text-sm">
                {[
                  { label: "Возможности", href: "#features", scroll: true },
                  { label: "Как работает", href: "#how-it-works", scroll: true },
                  { label: "Тарифы", href: "#pricing", scroll: true },
                  { label: "Войти", href: "https://app.roomi.pro", scroll: false },
                ].map((link) => (
                  <li key={link.label}>
                    {link.scroll ? (
                      <button
                        onClick={() => handleScroll(link.href)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                      >
                        {link.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Компания */}
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Компания</h3>
              <ul className="space-y-3 text-sm">
                {[
                  { label: "О нас", href: "#" },
                  { label: "Блог", href: "#" },
                  { label: "Карьера", href: "#" },
                  { label: "Контакты", href: "mailto:hello@roomi.pro" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Поддержка */}
            <div>
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Поддержка</h3>
              <ul className="space-y-3 text-sm">
                {[
                  { label: "Документация", href: "#" },
                  { label: "База знаний", href: "#" },
                  { label: "API", href: "#" },
                  { label: "Статус сервиса", href: "#" },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </FadeIn>

        {/* Bottom bar */}
        <div className="border-t border-border py-7 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm text-muted-foreground">
            <p>© 2025 Roomi. Все права защищены.</p>
            <span className="hidden md:inline text-border">·</span>
            <p>Владелец: Шинкаренко Владимир Юрьевич</p>
            <span className="hidden md:inline text-border">·</span>
            <p>ИНН 772831845861</p>
          </div>
          <div className="flex gap-5 text-sm text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Политика конфиденциальности
            </a>
            <a href="/terms" className="hover:text-foreground transition-colors">
              Условия использования
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
