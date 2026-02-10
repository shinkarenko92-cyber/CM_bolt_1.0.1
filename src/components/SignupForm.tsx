import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Form, Input, Checkbox, Button } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { signupSchema, type SignupFormValues } from '../schemas/auth';
import { LanguageSelector } from './LanguageSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from '@/lib/utils';

const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, '');

export function SignupForm() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      termsAccepted: false,
    },
  });

  const termsAccepted = watch('termsAccepted');

  const onSubmit = async (data: SignupFormValues) => {
    setSubmitError('');
    setLoading(true);
    try {
      const phoneNormalized = normalizePhone(data.phone);
      const { data: result, error } = await signUp({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: phoneNormalized || undefined,
      });
      if (error) throw error;
      if (result?.user?.id) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { supabase } = await import('../lib/supabase');
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.access_token && phoneNormalized) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.session.access_token}`,
              },
              body: JSON.stringify({ phone: phoneNormalized }),
            });
          } catch (e) {
            console.error('send-otp:', e);
          }
        }
        navigate('/verify-phone', { replace: true });
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>
      <Card className={cn('relative w-full max-w-md glass-card border-border shadow-2xl text-foreground')}>
        <CardHeader className="space-y-2 text-center pb-4">
          <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Roomi</CardTitle>
          <CardDescription className="text-foreground/90">Регистрация</CardDescription>
        </CardHeader>
        <CardContent className="text-foreground [&_.ant-form-item-label]:!text-foreground [&_.ant-input]:text-foreground [&_.ant-input]:bg-background [&_.ant-input-affix-wrapper]:text-foreground [&_.ant-input-affix-wrapper]:bg-background [&_.ant-checkbox-wrapper]:text-foreground">
          <form onSubmit={handleSubmit((data: SignupFormValues) => onSubmit(data))}>
            <Form layout="vertical">
              <Form.Item label="Имя" validateStatus={errors.firstName ? 'error' : undefined} help={errors.firstName?.message}>
                <Input
                  placeholder="Имя"
                  {...register('firstName')}
                  onChange={(e) => setValue('firstName', e.target.value, { shouldValidate: true })}
                  className="h-11"
                />
              </Form.Item>
              <Form.Item label="Фамилия" validateStatus={errors.lastName ? 'error' : undefined} help={errors.lastName?.message}>
                <Input
                  placeholder="Фамилия"
                  {...register('lastName')}
                  onChange={(e) => setValue('lastName', e.target.value, { shouldValidate: true })}
                  className="h-11"
                />
              </Form.Item>
              <Form.Item label="Email" validateStatus={errors.email ? 'error' : undefined} help={errors.email?.message}>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  {...register('email')}
                  onChange={(e) => setValue('email', e.target.value, { shouldValidate: true })}
                  className="h-11"
                />
              </Form.Item>
              <Form.Item label="Телефон" validateStatus={errors.phone ? 'error' : undefined} help={errors.phone?.message}>
                <Input
                  placeholder="Телефон"
                  {...register('phone')}
                  onChange={(e) => setValue('phone', e.target.value, { shouldValidate: true })}
                  className="h-11"
                />
              </Form.Item>
              <Form.Item label="Пароль" validateStatus={errors.password ? 'error' : undefined} help={errors.password?.message}>
                <Input.Password
                  placeholder="••••••••"
                  {...register('password')}
                  onChange={(e) => setValue('password', e.target.value, { shouldValidate: true })}
                  className="h-11"
                />
              </Form.Item>
              <Form.Item validateStatus={errors.termsAccepted ? 'error' : undefined} help={errors.termsAccepted?.message}>
                <Checkbox
                  checked={termsAccepted}
                  onChange={(e) => setValue('termsAccepted', e.target.checked, { shouldValidate: true })}
                >
                  Я согласен с <Link to="/terms">Условиями использования</Link> и <Link to="/privacy">Политикой конфиденциальности</Link>
                </Checkbox>
              </Form.Item>
              {submitError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">
                  {submitError}
                </div>
              )}
              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  disabled={!termsAccepted || !isValid || loading}
                  loading={loading}
                  block
                  className="h-11 font-semibold !min-h-11 bg-primary text-primary-foreground hover:!bg-primary/90 disabled:!opacity-100 disabled:!bg-muted disabled:!text-muted-foreground disabled:!border disabled:!border-border"
                >
                  Зарегистрироваться
                </Button>
              </Form.Item>
            </Form>
          </form>
          <p className="text-center text-sm text-foreground/90 mt-4">
            <Link to="/login" className="text-primary hover:underline">Уже есть аккаунт? Войти</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
