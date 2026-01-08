import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const testimonials = [
  {
    name: "Иван",
    location: "Москва",
    text: "С Roomi синхронизирую 50 объектов без головняка. Раньше тратил 3 часа в день на ручное обновление, теперь всё автоматом.",
    rating: 5,
    avatar: "👨‍💼"
  },
  {
    name: "Елена",
    location: "Санкт-Петербург",
    text: "Забыла про двойные бронирования! Roomi сразу блокирует даты на всех площадках. Клиенты довольны, я спокойна.",
    rating: 5,
    avatar: "👩‍💼"
  },
  {
    name: "Дмитрий",
    location: "Сочи",
    text: "Увеличил загрузку на 35% за первый месяц. Аналитика показала, какие каналы работают лучше — перераспределил бюджет.",
    rating: 5,
    avatar: "🧑‍💼"
  },
  {
    name: "Ольга",
    location: "Казань",
    text: "Управляю 20 апартаментами одна. Без Roomi это было бы невозможно. Автоответы и синхронизация календаря — просто магия!",
    rating: 5,
    avatar: "👩"
  }
];

export const Testimonials = () => {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Нам доверяют профессионалы
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Тысячи владельцев апартаментов уже экономят время с Roomi
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            className="w-full"
          >
            <CarouselContent>
              {testimonials.map((testimonial, index) => (
                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                  <Card className="p-6 h-full flex flex-col hover:shadow-lg transition-all duration-300 border-border/50">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <h4 className="font-bold">{testimonial.name}</h4>
                        <p className="text-sm text-muted-foreground">{testimonial.location}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                      ))}
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed flex-grow">
                      "{testimonial.text}"
                    </p>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="flex justify-center gap-2 mt-8">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          </Carousel>
        </div>
      </div>
    </section>
  );
};