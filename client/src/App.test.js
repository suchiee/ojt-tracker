import { render, screen } from '@testing-library/react';
import App from './App';

test('renders InternSync landing page', () => {
  render(<App />);
  const textElement = screen.getByText(/Track, Review, and Complete/i);
  expect(textElement).toBeInTheDocument();
});
