import { z } from 'zod';

const phoneRegex = /^\+?\d{9,15}$/;

export const signupSchema = z.object({
  firstName: z.string().min(2, 'Минимум 2 символа').max(50, 'Максимум 50 символов'),
  lastName: z.string().min(2, 'Минимум 2 символа').max(50, 'Максимум 50 символов'),
  email: z.string().email('Некорректный email'),
  phone: z
    .string()
    .min(9, 'Введите номер в международном формате')
    .refine((val) => phoneRegex.test(val.replace(/[\s\-()]/g, '')), 'Международный формат, например +995 5XX XXX XXX'),
  password: z.string().min(6, 'Минимум 6 символов'),
  termsAccepted: z.boolean().refine((v) => v === true, { message: 'Необходимо согласие' }),
});

export type SignupFormValues = z.infer<typeof signupSchema>;
