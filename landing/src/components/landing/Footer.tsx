import { Building2 } from "lucide-react";
export const Footer = () => {
  return <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 gradient-hero rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold">Roomi</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Канальный менеджер для эффективного управления апартаментами
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Продукт</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Возможности</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Интеграции</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Тарифы</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Обновления</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Компания</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">О нас</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Блог</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Карьера</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Контакты</a></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Поддержка</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground transition-colors">Документация</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">База знаний</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">API</a></li>
              <li><a href="#" className="hover:text-foreground transition-colors">Статус сервиса</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6 text-sm text-muted-foreground">
            <p>© 2025 Roomi. Все права защищены.</p>
            <p>Владелец: Шинкаренко Владимир Юрьевич</p>
            <p>ИНН 772831845861</p>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Политика конфиденциальности</a>
            <a href="#" className="hover:text-foreground transition-colors">Условия использования</a>
          </div>
        </div>
      </div>
    </footer>;
};
