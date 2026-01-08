import { Calendar, BarChart3, Zap, Shield, Globe, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const features = [
  {
    icon: Calendar,
    title: "Единый календарь",
    description: "Все бронирования со всех площадок в одном окне. Избегайте двойных бронирований автоматически."
  },
  {
    icon: Globe,
    title: "Интеграция с каналами",
    description: "Циан, Booking.com, Airbnb, Avito и другие площадки синхронизируются в реальном времени."
  },
  {
    icon: BarChart3,
    title: "Аналитика и отчёты",
    description: "Понятная статистика по доходам, загрузке и эффективности каждого канала."
  },
  {
    icon: Zap,
    title: "Автоматизация",
    description: "Автоматические ответы, изменение цен и обновление доступности по всем каналам."
  },
  {
    icon: Shield,
    title: "Безопасность данных",
    description: "Шифрование данных, резервное копирование и соответствие стандартам безопасности."
  },
  {
    icon: Clock,
    title: "Экономия времени",
    description: "Сокращение рутинных задач до 80%. Больше времени на развитие бизнеса."
  }
];

export const Features = () => {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Всё необходимое для управления
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Мощные инструменты для эффективного управления апартаментами
          </p>
        </div>

        {/* Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-8 hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/50 animate-slide-up"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-lg gradient-hero flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Mobile Carousel */}
        <div className="md:hidden max-w-sm mx-auto">
          <Carousel className="w-full">
            <CarouselContent>
              {features.map((feature, index) => (
                <CarouselItem key={index}>
                  <Card className="p-8 border-border/50">
                    <div className="w-12 h-12 rounded-lg gradient-hero flex items-center justify-center mb-4">
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="flex justify-center gap-2 mt-4">
              <CarouselPrevious className="static translate-y-0" />
              <CarouselNext className="static translate-y-0" />
            </div>
          </Carousel>
        </div>
      </div>
    </section>
  );
};
