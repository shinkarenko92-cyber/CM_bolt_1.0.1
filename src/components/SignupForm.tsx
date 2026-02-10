import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Form, Input, Checkbox, Button } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { signupSchema, type SignupFormValues } from '../schemas/auth';
import { LanguageSelector } from './LanguageSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, '');

const labelClassName = 'text-slate-200 font-medium text-base';
const inputClassName =
  'h-11 !bg-slate-800 !border-slate-600 !text-white placeholder:!text-slate-500 placeholder:!opacity-100 focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/30';

const signupFormOverrides = `
  .signup-form-dark .ant-form-item-label > label {
    color: #e2e8f0 !important;
    font-size: 1rem !important;
    font-weight: 500 !important;
  }
  .signup-form-dark .ant-input,
  .signup-form-dark .ant-input-affix-wrapper input.ant-input {
    color: #ffffff !important;
    background-color: #1e293b !important;
    border-color: #475569 !important;
  }
  .signup-form-dark .ant-input::placeholder,
  .signup-form-dark .ant-input-affix-wrapper input.ant-input::placeholder {
    color: #64748b !important;
    opacity: 1 !important;
  }
  .signup-form-dark .ant-input-affix-wrapper {
    background-color: #1e293b !important;
    border-color: #475569 !important;
  }
  .signup-form-dark .ant-checkbox-wrapper + span,
  .signup-form-dark .ant-checkbox-wrapper .ant-checkbox + span {
    color: #cbd5e1 !important;
  }
  .signup-form-dark .ant-checkbox-wrapper:hover .ant-checkbox + span,
  .signup-form-dark .ant-checkbox-wrapper:hover span.ant-checkbox-span {
    color: #e2e8f0 !important;
  }
  .signup-form-dark .ant-checkbox-checked .ant-checkbox-inner {
    background-color: #3b82f6 !important;
    border-color: #3b82f6 !important;
  }
  .signup-form-dark .ant-form-item-explain {
    color: #94a3b8 !important;
  }
  .signup-form-dark .ant-form-item-explain-error {
    color: #f87171 !important;
  }
`;

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
    <>
      <style>{signupFormOverrides}</style>
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
        <Card className="signup-form-dark relative w-full max-w-md mx-auto p-8 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700">
          <CardHeader className="space-y-2 text-center pb-4 px-0 pt-0">
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-white">Roomi</CardTitle>
            <CardDescription className="text-slate-400">Регистрация</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((data: SignupFormValues) => onSubmit(data))}>
              <Form layout="vertical" labelCol={{ span: 24 }} wrapperCol={{ span: 24 }}>
                <Form.Item
                  label={<span className={labelClassName}>Имя</span>}
                  validateStatus={errors.firstName ? 'error' : undefined}
                  help={errors.firstName?.message}
                >
                  <Input
                    placeholder="Имя"
                    {...register('firstName')}
                    onChange={(e) => setValue('firstName', e.target.value, { shouldValidate: true })}
                    className={inputClassName}
                  />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>Фамилия</span>}
                  validateStatus={errors.lastName ? 'error' : undefined}
                  help={errors.lastName?.message}
                >
                  <Input
                    placeholder="Фамилия"
                    {...register('lastName')}
                    onChange={(e) => setValue('lastName', e.target.value, { shouldValidate: true })}
                    className={inputClassName}
                  />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>Email</span>}
                  validateStatus={errors.email ? 'error' : undefined}
                  help={errors.email?.message}
                >
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    {...register('email')}
                    onChange={(e) => setValue('email', e.target.value, { shouldValidate: true })}
                    className={inputClassName}
                  />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>Телефон</span>}
                  validateStatus={errors.phone ? 'error' : undefined}
                  help={errors.phone?.message}
                >
                  <Input
                    placeholder="Телефон"
                    {...register('phone')}
                    onChange={(e) => setValue('phone', e.target.value, { shouldValidate: true })}
                    className={inputClassName}
                  />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>Пароль</span>}
                  validateStatus={errors.password ? 'error' : undefined}
                  help={errors.password?.message}
                >
                  <Input.Password
                    placeholder="••••••••"
                    {...register('password')}
                    onChange={(e) => setValue('password', e.target.value, { shouldValidate: true })}
                    className={inputClassName}
                  />
                </Form.Item>
                <Form.Item validateStatus={errors.termsAccepted ? 'error' : undefined} help={errors.termsAccepted?.message}>
                  <Checkbox
                    checked={termsAccepted}
                    onChange={(e) => setValue('termsAccepted', e.target.checked, { shouldValidate: true })}
                    className="[&_.ant-checkbox-inner]:!border-slate-500"
                  >
                    <span className="text-slate-300 hover:text-slate-200">
                      Я согласен с{' '}
                      <Link to="/terms" className="text-slate-400 hover:text-slate-200 underline">
                        Условиями использования
                      </Link>{' '}
                      и{' '}
                      <Link to="/privacy" className="text-slate-400 hover:text-slate-200 underline">
                        Политикой конфиденциальности
                      </Link>
                    </span>
                  </Checkbox>
                </Form.Item>
                {submitError && (
                  <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400 mb-4">
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
                    className="h-11 font-medium min-h-11 !bg-blue-600 hover:!bg-blue-700 !text-white !border-0"
                  >
                    Зарегистрироваться
                  </Button>
                </Form.Item>
              </Form>
            </form>
            <p className="text-center text-sm mt-4">
              <Link to="/login" className="text-blue-400 hover:text-blue-300 underline">
                Уже есть аккаунт? Войти
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
