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
  managerId: number | null;
  manager?: { id: number; name: string; designation: string | null } | null;
  isManager?: boolean;
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

export interface LeaveApproval {
  id: number;
  actor_id: number | null;
  actor_role: 'employee' | 'manager' | 'hr';
  action: string;
  comments: string | null;
  created_at: string;
  actor_name: string | null;
  actor_designation: string | null;
}

export interface Leave {
  id: number;
  user_id: number;
  type: 'casual' | 'sick' | 'earned' | 'unpaid';
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: 'pending' | 'pending_hr' | 'changes_requested' | 'approved' | 'rejected' | 'cancelled';
  manager_status: string | null;
  manager_note: string | null;
  admin_note: string | null;
  created_at: string;
  name?: string;
  employee_code?: string;
  manager_name?: string | null;
  approvals?: LeaveApproval[];
}

export interface CalendarDay {
  date: string;
  status: 'full' | 'half' | 'absent' | 'weekend' | 'holiday' | 'future' | 'working';
  holidayName: string | null;
  punchIn: string | null;
  punchOut: string | null;
  workingMinutes: number | null;
}

export interface OrgNode {
  id: number;
  name: string;
  employee_code: string;
  designation: string | null;
  department: string | null;
  project: string | null;
  company: string | null;
  role: string;
  manager_id: number | null;
  reports: OrgNode[];
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
