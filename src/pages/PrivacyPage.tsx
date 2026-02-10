import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';

const PRIVACY_PLACEHOLDER = `# Политика конфиденциальности

Текст будет добавлен.
`;

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Политика конфиденциальности</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-invert max-w-none dark:prose-invert">
            <ReactMarkdown>{PRIVACY_PLACEHOLDER}</ReactMarkdown>
          </CardContent>
        </Card>
        <div className="mt-4">
          <Button variant="ghost" asChild>
            <Link to="/login">Назад к входу</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
