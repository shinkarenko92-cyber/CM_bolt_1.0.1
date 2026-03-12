import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Start",
    monthlyPrice: 2990,
    description: "Для 1–3 квартир",
    features: [
      "До 3 апартаментов",
      "Единый календарь",
      "Базовая аналитика",
      "Email поддержка",
    ],
    popular: false,
    enterprise: false,
  },
  {
    name: "Pro",
    monthlyPrice: 4990,
    description: "Для 4–8 квартир",
    features: [
      "До 8 апартаментов",
      "Все каналы продаж",
      "Расширенная аналитика",
      "Приоритетная поддержка",
    ],
    popular: true,
    enterprise: false,
  },
  {
    name: "Business",
    monthlyPrice: 9990,
    description: "Для 8–15 квартир",
    features: [
      "До 15 апартаментов",
      "API и интеграции",
      "Приоритетная поддержка",
      "Мобильное приложение",
    ],
    popular: false,
    enterprise: false,
  },
  {
    name: "Enterprise",
    monthlyPrice: null,
    description: "15+ объектов",
    features: [
      "Неограниченно объектов",
      "Кастомизация интеграций",
      "Выделенный менеджер",
      "SLA и обучение команды",
    ],
    popular: false,
    enterprise: true,
  },
];

const YEARLY_DISCOUNT = 0.2;

function formatPrice(price: number): string {
  return price.toLocaleString("ru-RU");
}

export const Pricing = () => {
  const [yearly, setYearly] = useState(false);

  const getDisplayPrice = (monthlyPrice: number | null) => {
    if (monthlyPrice === null) return null;
    if (!yearly) return monthlyPrice;
    return Math.round(monthlyPrice * (1 - YEARLY_DISCOUNT));
  };

  return (
    <div className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-primary/20">
            Тарифы
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Прозрачные тарифы
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light mb-8">
            Выберите план, который подходит вашему бизнесу
          </p>

          {/* Monthly / Yearly toggle */}
          <div className="inline-flex items-center gap-3 bg-secondary rounded-xl p-1">
            <button
              onClick={() => setYearly(false)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                !yearly
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Месяц
            </button>
            <button
              onClick={() => setYearly(true)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2",
                yearly
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Год
              <span className="bg-green-500/15 text-green-600 text-xs font-bold px-1.5 py-0.5 rounded-md">
                −20%
              </span>
            </button>
          </div>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {plans.map((plan, index) => {
            const displayPrice = getDisplayPrice(plan.monthlyPrice);
            return (
              <FadeIn key={index} delay={index * 80}>
                <div
                  className={cn(
                    "relative bg-card border rounded-2xl p-7 flex flex-col h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
                    plan.popular
                      ? "border-primary border-2 shadow-md"
                      : "border-border/50 hover:border-border"
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 gradient-hero text-white px-4 py-1 rounded-full text-xs font-bold shadow-sm whitespace-nowrap">
                      ⭐ Популярный
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                    <p className="text-muted-foreground text-sm">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    {displayPrice !== null ? (
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-bold">{formatPrice(displayPrice)}</span>
                        <span className="text-muted-foreground text-sm mb-1.5">₽/мес</span>
                      </div>
                    ) : (
                      <div className="text-3xl font-bold">По запросу</div>
                    )}
                    {yearly && displayPrice !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Оплата раз в год · экономия {formatPrice(Math.round(plan.monthlyPrice! * YEARLY_DISCOUNT * 12))} ₽
                      </p>
                    )}
                    {!yearly && displayPrice !== null && (
                      <p className="text-xs text-muted-foreground mt-1 opacity-0 select-none">—</p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {plan.enterprise ? (
                    <Button variant="outline" className="w-full" size="lg" asChild>
                      <a href="mailto:hello@roomi.pro">Связаться</a>
                    </Button>
                  ) : (
                    <Button
                      variant={plan.popular ? "hero" : "outline"}
                      className="w-full"
                      size="lg"
                      asChild
                    >
                      <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                        Начать
                      </a>
                    </Button>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>

        <FadeIn delay={360} className="text-center mt-10">
          <p className="text-muted-foreground text-sm">
            Все тарифы включают <strong>7 дней бесплатного тестирования</strong> · Без кредитной карты
          </p>
        </FadeIn>
      </div>
    </div>
  );
};
