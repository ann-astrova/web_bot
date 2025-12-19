export interface Expense {
  id?: number;              // id расхода (на сервере)
  amount: number;           // сумма расхода
  description: string;      // описание
  date: string;             // дата в формате YYYY-MM-DD
  categoryId: number;       // id категории
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
}

export interface Category {
  id: number;               // id категории
  name: string;             // название категории
  description?: string;     
}

