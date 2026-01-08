import { Link2, Settings, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Link2,
    step: "01",
    title: "Подключите каналы",
    description: "Интегрируйте все ваши площадки за несколько минут. Booking, Airbnb, Avito и другие."
  },
  {
    icon: Settings,
    step: "02",
    title: "Настройте автоматизацию",
    description: "Установите правила для цен, доступности и автоответов. Система работает за вас 24/7."
  },
  {
    icon: TrendingUp,
    step: "03",
    title: "Растите доход",
    description: "Отслеживайте аналитику и оптимизируйте стратегию. Увеличьте доход до 40%."
  }
];

export const HowItWorks = () => {
  return (
    <section className="py-24 gradient-subtle">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Как это работает
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Три простых шага до автоматизации вашего бизнеса
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div 
                key={index}
                className="relative animate-slide-up"
                style={{ animationDelay: `${index * 0.2}s` }}
              >
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl gradient-accent flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <step.icon className="w-10 h-10 text-white" />
                  </div>
                  <div className="text-6xl font-bold text-primary/20 mb-4">
                    {step.step}
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
