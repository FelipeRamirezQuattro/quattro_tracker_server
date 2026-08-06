import nodemailer from 'nodemailer';
import { Env } from '../config/env';

export async function sendPasswordResetEmail({
  to,
  resetLink,
  env,
}: {
  to: string;
  resetLink: string;
  env: Env;
}): Promise<void> {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.emailFrom, pass: env.emailPassword },
  });

  await transport.sendMail({
    from: env.emailFrom,
    to,
    subject: 'Reset your password',
    html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`,
  });
}
