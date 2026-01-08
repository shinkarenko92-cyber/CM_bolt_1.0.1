import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "2 990",
    period: "месяц",
    description: "Для владельцев 1-3 апартаментов",
    features: [
      "До 3 апартаментов",
      "Все основные каналы",
      "Единый календарь",
      "Базовая аналитика",
      "Email поддержка"
    ],
    popular: false
  },
  {
    name: "Professional",
    price: "5 990",
    period: "месяц",
    description: "Для управляющих компаний",
    features: [
      "До 15 апартаментов",
      "Все каналы + API",
      "Расширенная аналитика",
      "Автоматизация цен",
      "Приоритетная поддержка",
      "Мобильное приложение"
    ],
    popular: true
  },
  {
    name: "Enterprise",
    price: "По запросу",
    period: "",
    description: "Для крупных портфелей",
    features: [
      "Неограниченно объектов",
      "Кастомизация интеграций",
      "Выделенный менеджер",
      "SLA 99.9%",
      "Обучение команды",
      "White-label решение"
    ],
    popular: false
  }
];

export const Pricing = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Прозрачные тарифы
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Выберите план, который подходит вашему бизнесу
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`p-8 relative ${
                plan.popular 
                  ? 'border-primary border-2 shadow-glow' 
                  : 'border-border/50'
              } animate-slide-up`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 gradient-hero text-white px-4 py-1 rounded-full text-sm font-semibold">
                  Популярный
                </div>
              )}
              
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {plan.description}
                </p>
                <div className="mb-2">
                  <span className="text-5xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-muted-foreground ml-2">₽/{plan.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.popular ? "hero" : "outline"} 
                className="w-full"
                size="lg"
                asChild={plan.name !== "Enterprise"}
              >
                {plan.name === "Enterprise" ? (
                  "Связаться"
                ) : (
                  <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                    Начать
                  </a>
                )}
              </Button>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground">
            Все тарифы включают 14 дней бесплатного тестирования
          </p>
        </div>
      </div>
    </section>
  );
};
