import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Start",
    monthlyPrice: 2990,
    promoPrice: 500,
    description: "Для 1–3 квартир",
    features: [
      "До 3 апартаментов",
      "Единый календарь",
      "Настраиваемые виджеты",
      "Мессенджер Авито",
      "PWA-приложение",
    ],
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: 4990,
    promoPrice: 500,
    description: "Для 4–8 квартир",
    features: [
      "До 8 апартаментов",
      "Все каналы продаж",
      "Расширенная аналитика",
      "Приоритетная поддержка",
      "Мессенджер Авито",
    ],
    popular: true,
  },
  {
    name: "Business",
    monthlyPrice: 9990,
    promoPrice: 500,
    description: "Для 8–15 квартир",
    features: [
      "До 15 апартаментов",
      "API и интеграции",
      "Прямая связь с разработчиками",
      "PWA-приложение",
      "Мессенджер Авито",
    ],
    popular: false,
  },
];

function formatPrice(price: number): string {
  return price.toLocaleString("ru-RU");
}

export const PromoPricing = () => {
  return (
    <div className="py-24 bg-muted/20">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-primary/20">
            Особые условия
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Прозрачная цена
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light mb-8">
            <b>Первый месяц за 500₽</b> для первых 10 человек. Без скрытых условий.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <FadeIn key={index} delay={index * 80}>
              <div
                className={cn(
                  "relative bg-card border rounded-2xl p-8 flex flex-col h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
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
                  <div className="flex flex-col">
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold text-primary">{plan.promoPrice} ₽</span>
                      <span className="text-muted-foreground text-sm mb-1.5">первый месяц</span>
                    </div>
                    <div className="text-muted-foreground text-sm mt-1">
                      далее — {formatPrice(plan.monthlyPrice)} ₽/мес
                    </div>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={plan.popular ? "hero" : "outline"}
                  className="w-full h-12 rounded-xl text-base font-semibold"
                  asChild
                >
                  <a href="https://app.roomi.pro" target="_blank" rel="noopener noreferrer">
                    Занять место за 500₽
                  </a>
                </Button>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={360} className="text-center mt-12 bg-white/50 border border-primary/20 rounded-2xl p-6 max-w-2xl mx-auto shadow-sm">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Мы только запускаемся и ищем первых пользователей, которым поможем автоматизировать бизнес.
            Если у вас больше 15 объектов, напишите нам на <a href="mailto:hello@roomi.pro" className="text-primary font-semibold hover:underline">hello@roomi.pro</a> — обсудим индивидуальные условия.
          </p>
        </FadeIn>
      </div>
    </div>
  );
};
