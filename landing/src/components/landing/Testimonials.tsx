import { Star, Quote } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

const testimonials = [
  {
    name: "Геннадий Посуточников",
    location: "Москва",
    role: "50 апартаментов",
    text: "С Roomi синхронизирую 50 объектов без головняка. Раньше тратил 3 часа в день на ручное обновление, теперь всё автоматом. Доход вырос на 35% за первые два месяца.",
    rating: 5,
    avatar: "/avatars/gennadiy-posutochnikov.png",
  },
  {
    name: "Ирина Заселяйко",
    location: "Санкт-Петербург",
    role: "12 апартаментов",
    text: "Забыла про двойные бронирования! Roomi сразу блокирует даты на всех площадках. Клиенты довольны, я спокойна.",
    rating: 5,
    avatar: "/avatars/irina-zaselyayko.png",
  },
  {
    name: "Борис Выселяев",
    location: "Сочи",
    role: "8 апартаментов",
    text: "Увеличил загрузку на 35% за первый месяц. Аналитика показала, какие каналы работают лучше — перераспределил бюджет.",
    rating: 5,
    avatar: "/avatars/boris-vyselyaev.png",
  },
  {
    name: "Ольга Автоответова",
    location: "Казань",
    role: "20 апартаментов",
    text: "Управляю 20 апартаментами одна. Без Roomi это было бы невозможно. Автоответы и синхронизация — просто магия!",
    rating: 5,
    avatar: "/avatars/olga-avtootvetova.png",
  },
];

const anchorTestimonial = testimonials[0];
const gridTestimonials = testimonials.slice(1);

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-accent text-accent" />
      ))}
    </div>
  );
}

export const Testimonials = () => {
  return (
    <div className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-sm font-medium mb-4 border border-accent/20">
            Отзывы
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Нам доверяют профессионалы
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Тысячи владельцев апартаментов уже экономят время с Roomi
          </p>
        </FadeIn>

        <div className="max-w-5xl mx-auto">
          {/* Anchor large quote */}
          <FadeIn delay={80}>
            <div className="relative bg-gradient-to-br from-primary/5 to-accent/5 border border-border/60 rounded-3xl p-8 md:p-10 mb-6 overflow-hidden">
              <Quote className="absolute top-6 right-8 w-16 h-16 text-primary/10 rotate-180" />
              <div className="flex items-start gap-5">
                <img
                  src={anchorTestimonial.avatar}
                  alt={anchorTestimonial.name}
                  className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border-2 border-border"
                />
                <div className="flex-grow">
                  <StarRating count={anchorTestimonial.rating} />
                  <p className="text-lg md:text-xl text-foreground leading-relaxed mt-3 mb-5 font-medium">
                    "{anchorTestimonial.text}"
                  </p>
                  <div>
                    <div className="font-bold">{anchorTestimonial.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {anchorTestimonial.location} · {anchorTestimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Supporting grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {gridTestimonials.map((t, index) => (
              <FadeIn key={index} delay={160 + index * 100}>
                <div className="bg-card border border-border/50 rounded-2xl p-6 h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 hover:border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src={t.avatar}
                      alt={t.name}
                      className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-border"
                    />
                    <div>
                      <div className="font-bold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.location} · {t.role}</div>
                    </div>
                  </div>
                  <StarRating count={t.rating} />
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">"{t.text}"</p>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Summary stats */}
          <FadeIn delay={480}>
            <div className="mt-10 grid grid-cols-3 gap-4">
              {[
                { value: "4.9/5", label: "Средний рейтинг" },
                { value: "5 000+", label: "Активных объектов" },
                { value: "98%", label: "Довольных клиентов" },
              ].map((stat) => (
                <div key={stat.label} className="text-center bg-muted/40 rounded-2xl py-5 px-4">
                  <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </div>
  );
};
