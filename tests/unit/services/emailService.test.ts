jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue(undefined) })),
}));

import nodemailer from 'nodemailer';
import { sendPasswordResetEmail } from '../../../src/services/emailService';

const testEnv = { emailFrom: 'noreply@example.com', emailPassword: 'app-password' } as any;

describe('emailService', () => {
  it('sends a password reset email via nodemailer', async () => {
    await sendPasswordResetEmail({ to: 'user@example.com', resetLink: 'https://app/reset?token=x', env: testEnv });

    const createTransportMock = nodemailer.createTransport as jest.Mock;
    expect(createTransportMock).toHaveBeenCalled();
    const transportInstance = createTransportMock.mock.results[0].value;
    expect(transportInstance.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' })
    );
  });
});
