import { Calendar, BarChart3, Zap, Clock, MessageSquare, Smartphone } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const features = [
  {
    icon: Calendar,
    title: "Единый календарь",
    description: "Все бронирования со всех площадок в одном окне. Забудьте о двойных бронированиях навсегда.",
    accent: "from-blue-500/10 to-blue-600/5",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: MessageSquare,
    title: "Мессенджер Авито",
    description: "Общайтесь с гостями Авито прямо из Roomi. Не нужно переключаться между приложениями.",
    accent: "from-orange-500/10 to-orange-600/5",
    iconBg: "bg-orange-500/10",
    iconColor: "text-orange-500",
  },
  {
    icon: BarChart3,
    title: "Настраиваемая аналитика",
    description: "Создавайте свой дашборд с виджетами. Отслеживайте только то, что важно для вас.",
    accent: "from-emerald-500/10 to-emerald-600/5",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
  },
  {
    icon: Zap,
    title: "Мгновенная синхронизация",
    description: "Быстрая синхронизация с Авито и другими каналами в реальном времени.",
    accent: "from-amber-500/10 to-amber-600/5",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
  },
  {
    icon: Smartphone,
    title: "Удобное PWA-приложение",
    description: "Полноценное управление объектами с мобильного телефона. Работает быстро и надежно.",
    accent: "from-indigo-500/10 to-indigo-600/5",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-500",
  },
  {
    icon: Clock,
    title: "Экономия времени",
    description: "Сокращение рутинных задач до 80%. Мы автоматизируем процессы, чтобы вы отдыхали.",
    accent: "from-cyan-500/10 to-cyan-600/5",
    iconBg: "bg-cyan-500/10",
    iconColor: "text-cyan-500",
  },
];

export const PromoFeatures = () => {
  return (
    <div className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-primary/20">
            Возможности
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Всё для легкого управления
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Продуманные инструменты, созданные для вашего удобства
          </p>
        </FadeIn>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FadeIn key={index} delay={index * 80}>
              <div
                className={`group relative bg-card border border-border/50 rounded-2xl p-7 h-full overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-border hover:-translate-y-1`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-60 rounded-2xl pointer-events-none`} />
                <div className="relative z-10">
                  <div className={`w-12 h-12 ${feature.iconBg} rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}>
                    <feature.icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm">{feature.description}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
};
