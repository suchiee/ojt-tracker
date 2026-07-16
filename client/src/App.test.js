import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OJT Tracker landing page', () => {
  render(<App />);
  const textElement = screen.getByText(/Track, Report, and Succeed/i);
  expect(textElement).toBeInTheDocument();
});
