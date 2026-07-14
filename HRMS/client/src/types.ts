export interface User {
  id: number;
  employeeCode: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  departmentId: number | null;
  department: string | null;
  designation: string | null;
  phone: string | null;
  joinDate: string | null;
  status: 'active' | 'inactive';
  leaveBalance: { casual: number; sick: number; earned: number };
}

export interface AttendanceRecord {
  id: number;
  user_id: number;
  work_date: string;
  punch_in_at: string;
  punch_in_lat: number | null;
  punch_in_lng: number | null;
  punch_in_selfie: string | null;
  punch_out_at: string | null;
  punch_out_lat: number | null;
  punch_out_lng: number | null;
  punch_out_selfie: string | null;
  face_match_score: number | null;
  liveness_passed: number;
  working_minutes: number | null;
  name?: string;
  employee_code?: string;
  department?: string | null;
}

export interface Leave {
  id: number;
  user_id: number;
  type: 'casual' | 'sick' | 'earned' | 'unpaid';
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  admin_note: string | null;
  created_at: string;
  name?: string;
  employee_code?: string;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  kind: string;
  read: number;
  created_at: string;
}

export interface Department { id: number; name: string }
