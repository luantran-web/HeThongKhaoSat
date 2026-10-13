import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import AdminLayout from '@/components/AdminLayout'
import PublicLayout from '@/components/PublicLayout'
import Login from '@/pages/admin/Login'
import Placeholder from '@/pages/admin/Placeholder'
import Home from '@/pages/public/Home'
import SurveyPage from '@/pages/public/SurveyPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
            </Route>
            <Route path="/khao-sat/:slug" element={<SurveyPage />} />
            <Route path="/admin/dang-nhap" element={<Login />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Placeholder title="Tổng quan" />} />
              <Route path="khao-sat" element={<Placeholder title="Quản lý khảo sát" />} />
              <Route path="phan-tich" element={<Placeholder title="Phân tích" />} />
              <Route path="tai-ve" element={<Placeholder title="Tải dữ liệu" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
