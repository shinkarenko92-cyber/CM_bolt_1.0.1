import { Link2, Settings, TrendingUp } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const steps = [
  {
    icon: Link2,
    step: "01",
    title: "Подключите каналы",
    description: "Интегрируйте все ваши площадки за несколько минут. Booking, Airbnb, Avito, Циан и другие.",
    time: "5 минут",
    color: "from-blue-500 to-blue-600",
    bgLight: "bg-blue-500/10",
    textColor: "text-blue-500",
  },
  {
    icon: Settings,
    step: "02",
    title: "Настройте автоматизацию",
    description: "Установите правила для цен, доступности и автоответов. Система работает за вас 24/7.",
    time: "10 минут",
    color: "from-violet-500 to-violet-600",
    bgLight: "bg-violet-500/10",
    textColor: "text-violet-500",
  },
  {
    icon: TrendingUp,
    step: "03",
    title: "Растите доход",
    description: "Отслеживайте аналитику и оптимизируйте стратегию вашего бизнеса.",
    time: "с первого дня",
    color: "from-emerald-500 to-emerald-600",
    bgLight: "bg-emerald-500/10",
    textColor: "text-emerald-500",
  },
];

export const HowItWorks = () => {
  return (
    <div className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-accent/20">
            Как это работает
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Три шага до автоматизации
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Начните работу с Roomi и автоматизируйте управление апартаментами уже сегодня
          </p>
        </FadeIn>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-10 left-[calc(33%+1.5rem)] right-[calc(33%+1.5rem)] h-px bg-gradient-to-r from-blue-400/40 via-violet-400/40 to-emerald-400/40" />

            {steps.map((step, index) => (
              <FadeIn key={index} delay={index * 140} direction="up">
                <div className="group relative bg-card border border-border/50 rounded-2xl p-7 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 hover:border-border">
                  {/* Step number background */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <step.icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-bold text-muted-foreground/20 leading-none">{step.step}</div>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-sm mb-5">{step.description}</p>

                  {/* Time badge */}
                  <div className={`inline-flex items-center gap-1.5 ${step.bgLight} ${step.textColor} px-3 py-1.5 rounded-full text-xs font-semibold`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {step.time}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
