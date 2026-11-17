"""Create a named employee: python -m backend.create_employee USERNAME."""
import argparse
from getpass import getpass
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db import DATABASE_URL, Employee
from .main import password_hash

def main():
    parser = argparse.ArgumentParser(description="Create a report desk employee")
    parser.add_argument("username")
    args = parser.parse_args()
    username = args.username.strip()
    if not username or len(username) > 80:
        parser.error("Username must contain 1-80 characters")
    password = getpass("Password: ")
    if len(password) < 12 or len(password) > 1024:
        parser.error("Password must contain 12-1024 characters")
    if password != getpass("Repeat password: "):
        parser.error("Passwords do not match")
    with Session(create_engine(DATABASE_URL)) as db:
        db.add(Employee(username=username, password_hash=password_hash(password)))
        try:
            db.commit()
        except IntegrityError:
            parser.error("Employee already exists")
    print("Employee created")

if __name__ == "__main__":
    main()
