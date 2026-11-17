import './globals.css';

export const metadata = {
  title: 'SkillSwap Campus',
  description: 'Peer-to-peer skill exchange and resource sharing for university campuses',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
