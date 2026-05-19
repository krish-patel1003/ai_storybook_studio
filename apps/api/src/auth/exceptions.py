from fastapi import status

from src.exceptions import AppException


class InvalidCredentials(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Invalid email or password"


class EmailAlreadyTaken(AppException):
    status_code = status.HTTP_409_CONFLICT
    detail = "An account with this email already exists"


class RefreshTokenNotValid(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Refresh token is invalid or expired"


class InvalidGoogleToken(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    detail = "Could not verify Google token"


class UserNotFound(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    detail = "User not found"


class AccountInactive(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    detail = "This account has been deactivated"
