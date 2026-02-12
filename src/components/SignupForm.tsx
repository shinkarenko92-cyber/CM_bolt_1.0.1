import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Form, Input, Checkbox, Button, Modal, message } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

const normalizePhone = (v: string) => v.replace(/[\s\-()]/g, '');

const labelClassName = 'text-slate-300 font-medium text-base';
const inputClassName =
  'h-11 !bg-slate-800 !border-slate-600 !text-white placeholder:!text-slate-500 placeholder:!opacity-100 hover:!border-slate-500 focus:!border-blue-500 focus:!ring-2 focus:!ring-blue-500/30 focus:!bg-slate-800 focus:!shadow-none';

const signupFormOverrides = `
  .signup-form-dark .ant-form-item-required .ant-form-item-required-mark,
  .signup-form-dark .ant-form-item-required .ant-form-item-required-mark-optional {
    display: none !important;
  }
  .signup-form-dark .ant-form-item-label > label {
    color: #cbd5e1 !important;
    font-size: 1rem !important;
    font-weight: 500 !important;
  }
  .signup-form-dark .ant-input,
  .signup-form-dark .ant-input:hover,
  .signup-form-dark .ant-input-affix-wrapper input.ant-input,
  .signup-form-dark .ant-input-affix-wrapper input.ant-input:hover {
    color: #ffffff !important;
    background-color: #1e293b !important;
    border-color: #475569 !important;
  }
  .signup-form-dark .ant-input:focus,
  .signup-form-dark .ant-input-focused,
  .signup-form-dark .ant-input-affix-wrapper:focus-within,
  .signup-form-dark .ant-input-affix-wrapper-focused {
    color: #ffffff !important;
    background-color: #1e293b !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3) !important;
    outline: none !important;
  }
  .signup-form-dark .ant-input:hover,
  .signup-form-dark .ant-input-affix-wrapper:hover {
    border-color: #64748b !important;
  }
  .signup-form-dark .ant-input::placeholder,
  .signup-form-dark .ant-input-affix-wrapper input.ant-input::placeholder {
    color: #64748b !important;
    opacity: 1 !important;
  }
  .signup-form-dark .ant-input-affix-wrapper,
  .signup-form-dark .ant-input-affix-wrapper:hover {
    background-color: #1e293b !important;
    border-color: #475569 !important;
  }
  .signup-form-dark .ant-input-affix-wrapper:focus-within,
  .signup-form-dark .ant-input-affix-wrapper-focused {
    background-color: #1e293b !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3) !important;
  }
  .signup-form-dark .ant-checkbox-wrapper + span,
  .signup-form-dark .ant-checkbox-wrapper .ant-checkbox + span {
    color: #cbd5e1 !important;
  }
  .signup-form-dark .ant-checkbox-wrapper:hover .ant-checkbox + span,
  .signup-form-dark .ant-checkbox-wrapper:hover span.ant-checkbox-span {
    color: #e2e8f0 !important;
  }
  .signup-form-dark .ant-checkbox-inner {
    border-color: #64748b !important;
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

type SignupFields = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
};

export function SignupForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form] = Form.useForm<SignupFields>();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSignup = async (values: SignupFields) => {
    setSubmitError('');
    setLoading(true);
    const phoneNormalized = normalizePhone(values.phone);
    const email = values.email;

    try {
      console.log('Форма отправлена:', values);
      const { data, error } = await signUp({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        phone: phoneNormalized || undefined,
      });
      console.log('Supabase:', { data, error });

      if (error) {
        message.error(error.message);
        setSubmitError(error.message);
        return;
      }

      if (data?.user && !data?.session) {
        message.success(t('auth.signupEmailSent', { email }));
        setTimeout(() => {
          Modal.success({
            content: t('auth.verifyEmailNotice'),
            okText: t('common.confirm'),
            getContainer: () => document.body,
            onOk: () => navigate('/login', { replace: true, state: { fromSignup: true } }),
          });
        }, 0);
        return;
      }

      if (data?.session) {
        message.success(t('auth.signupSuccess'));
        navigate('/', { replace: true });
        return;
      }

      if (data?.user) {
        message.success(t('auth.signupEmailSent', { email }));
        setTimeout(() => {
          Modal.success({
            content: t('auth.verifyEmailNotice'),
            okText: t('common.confirm'),
            getContainer: () => document.body,
            onOk: () => navigate('/login', { replace: true, state: { fromSignup: true } }),
          });
        }, 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('errors.somethingWentWrong');
      message.error(msg);
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onButtonClick = () => form.submit();
  const onWrapperKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      form.submit();
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
        <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
          <ThemeToggle />
          <LanguageSelector />
        </div>
        <Card className="signup-form-dark relative w-full max-w-md mx-auto p-8 bg-slate-900/80 rounded-2xl shadow-2xl border border-slate-700">
          <CardHeader className="space-y-2 text-center pb-4 px-0 pt-0">
            <CardTitle className="text-2xl md:text-3xl font-bold tracking-tight text-primary">Roomi</CardTitle>
            <CardDescription className="text-sky-500/90">{t('auth.signUp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div onKeyDown={onWrapperKeyDown}>
              <Form
                form={form}
                layout="vertical"
                labelCol={{ span: 24 }}
                wrapperCol={{ span: 24 }}
                onFinish={handleSignup}
                initialValues={{ termsAccepted: false }}
                requiredMark={false}
              >
                <Form.Item
                  label={<span className={labelClassName}>{t('auth.firstName')}</span>}
                  name="firstName"
                  rules={[{ required: true, message: t('auth.enterFirstName') }, { min: 2, message: t('auth.minTwoChars') }]}
                >
                  <Input placeholder={t('auth.firstName')} className={inputClassName} />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>{t('auth.lastName')}</span>}
                  name="lastName"
                  rules={[{ required: true, message: t('auth.enterLastName') }, { min: 2, message: t('auth.minTwoChars') }]}
                >
                  <Input placeholder={t('auth.lastName')} className={inputClassName} />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>{t('auth.email')}</span>}
                  name="email"
                  rules={[{ required: true, message: t('auth.enterEmail') }, { type: 'email', message: t('errors.invalidEmail') }]}
                >
                  <Input type="email" placeholder="you@example.com" className={inputClassName} />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>{t('auth.phone')}</span>}
                  name="phone"
                  rules={[
                    { required: true, message: t('auth.enterPhone') },
                    { min: 9, message: t('auth.internationalPhoneFormat') },
                  ]}
                >
                  <Input placeholder={t('auth.phone')} className={inputClassName} />
                </Form.Item>
                <Form.Item
                  label={<span className={labelClassName}>{t('auth.password')}</span>}
                  name="password"
                  rules={[{ required: true, message: t('auth.enterPassword') }, { min: 6, message: t('auth.passwordMinChars') }]}
                >
                  <Input.Password placeholder="••••••••" className={inputClassName} />
                </Form.Item>
                <Form.Item
                  name="termsAccepted"
                  valuePropName="checked"
                  rules={[{ required: true }, { validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error(t('auth.requiredConsent')))) }]}
                >
                  <Checkbox className="[&_.ant-checkbox-inner]:!border-slate-500">
                    <span className="text-slate-300 hover:text-slate-200">
                      {t('auth.agreeWith')}{' '}
                      <Link to="/terms" className="text-slate-400 hover:text-slate-200 underline" onClick={(e) => e.stopPropagation()}>
                        {t('auth.termsOfUse')}
                      </Link>{' '}
                      {t('common.and')}{' '}
                      <Link to="/privacy" className="text-slate-400 hover:text-slate-200 underline" onClick={(e) => e.stopPropagation()}>
                        {t('auth.privacyPolicy')}
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
                    htmlType="button"
                    loading={loading}
                    block
                    onClick={onButtonClick}
                    className="h-11 font-medium min-h-11 !bg-blue-600 hover:!bg-blue-700 !text-white !border-0"
                  >
                    {t('auth.signUp')}
                  </Button>
                </Form.Item>
              </Form>
            </div>
            <p className="text-center text-sm mt-4">
              <Link to="/login" className="text-blue-400 hover:text-blue-300 underline">
                {t('auth.alreadyHaveAccount')}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
