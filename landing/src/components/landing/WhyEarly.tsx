import { Users, Code, Star, Heart } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const reasons = [
  {
    icon: Code,
    title: "Влияйте на продукт",
    description: "Первые пользователи — наши главные советники. Мы добавим функции, которые нужны именно вам.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: Users,
    title: "Прямая связь",
    description: "У вас будет прямой доступ к основателям и разработчикам. Поддержка без очередей и тикетов.",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: Star,
    title: "Привилегии навсегда",
    description: "Для первых 10 клиентов мы закрепим особый статус и лучшие условия на все будущие обновления.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: Heart,
    title: "Честный сервис",
    description: "Мы только начинаем, поэтому для нас дорог каждый клиент. Гарантируем максимум внимания.",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
  },
];

export const WhyEarly = () => {
  return (
    <div className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-accent/20">
            Для первых пользователей
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Почему стоит стать ранним пользователем
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Мы ищем партнеров, а не просто клиентов. Давайте строить Roomi вместе.
          </p>
        </FadeIn>

        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          {reasons.map((reason, index) => (
            <FadeIn key={index} delay={index * 100}>
              <div className="bg-card border border-border/50 rounded-2xl p-8 flex gap-6 hover:shadow-md transition-all duration-300">
                <div className={`w-14 h-14 ${reason.bg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
                  <reason.icon className={`w-7 h-7 ${reason.color}`} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{reason.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {reason.description}
                  </p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
};
