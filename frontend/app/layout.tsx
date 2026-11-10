import type { Metadata } from 'next';
import './globals.css';

export const metadata:Metadata={title:'AI-CRMS | Compute Resource Management',description:'Manage GPU infrastructure, experiments, and training jobs.'};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
