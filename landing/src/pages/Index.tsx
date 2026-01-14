import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-6xl md:text-7xl font-bold text-white mb-4 animate-pulse">
              Roomi Pro
            </h1>
            <div className="w-24 h-1 bg-teal-500 mx-auto mb-8"></div>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-200 mb-4">
              Ведутся технические работы
            </h2>
            <p className="text-lg md:text-xl text-slate-400 mb-8">
              Мы улучшаем наш сервис для вас.<br />
              Скоро мы вернемся с обновлениями!
            </p>
            
            <div className="flex items-center justify-center space-x-2 text-slate-500">
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
