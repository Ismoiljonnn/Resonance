import random
from datetime import datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from .models import db, User, AudioPost
from .auth import is_admin

api_bp = Blueprint("api", __name__, url_prefix="/api")

# ---------- Guest mode: no login required ----------

@api_bp.route("/markers")
def get_markers():
    """Active posts from the last 24 hours shown on the 3D globe"""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    posts = AudioPost.query.filter(
        AudioPost.is_active == True,
        AudioPost.created_at >= cutoff,
    ).all()
    return jsonify([p.to_map_marker() for p in posts])


@api_bp.route("/profile/<user_id>")
def get_public_profile(user_id):
    """Profile page shown when a marker is clicked — no login required to view"""
    user = User.query.get_or_404(user_id)
    viewer_id = current_user.id if current_user.is_authenticated else None
    return jsonify(user.to_public_dict(viewer_id))


@api_bp.route("/post/<post_id>")
def get_single_post(post_id):
    """Used when a share link is opened directly — no login required to view"""
    post = AudioPost.query.filter_by(id=post_id, is_active=True).first_or_404()
    viewer_id = current_user.id if current_user.is_authenticated else None
    return jsonify(post.to_dict(viewer_id))


# ---------- Everything below requires login ----------

@api_bp.route("/profile", methods=["PUT"])
@login_required
def update_my_profile():
    """
    Profile setup step (completed once, before publishing a post):
    username, bio, region, social links, etc.
    """
    data = request.get_json(force=True)

    username = data.get("username", "").strip()
    if username:
        existing = User.query.filter(
            User.username == username, User.id != current_user.id
        ).first()
        if existing:
            return jsonify({"error": "This username is taken"}), 400
        current_user.username = username

    current_user.bio = data.get("bio", current_user.bio)
    current_user.location_city = data.get("location_city", current_user.location_city)
    current_user.location_country = data.get("location_country", current_user.location_country)

    # The region picked at signup determines where the user's posts
    # appear on the globe — no manual pin-dropping.
    home_lat = data.get("home_lat")
    home_lng = data.get("home_lng")
    if home_lat is not None and home_lng is not None:
        current_user.home_lat = float(home_lat)
        current_user.home_lng = float(home_lng)

    social_links = data.get("social_links")
    if isinstance(social_links, dict):
        allowed_keys = {"telegram", "github", "instagram", "portfolio", "website"}
        current_user.social_links = {
            k: v for k, v in social_links.items() if k in allowed_keys and v
        }

    db.session.commit()
    return jsonify(current_user.to_public_dict())


@api_bp.route("/text-post", methods=["POST"])
@login_required
def create_text_post():
    """Publish a text post — an alternative or addition to audio"""
    if not current_user.is_profile_complete:
        return jsonify({"error": "profile_incomplete",
                         "message": "Please complete your bio, username, and region first"}), 400

    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    base_lat = current_user.home_lat
    base_lng = current_user.home_lng

    if not text:
        return jsonify({"error": "Text cannot be empty"}), 400
    if len(text) > 500:
        return jsonify({"error": "Text cannot exceed 500 characters"}), 400
    if base_lat is None or base_lng is None:
        return jsonify({"error": "Set your region in your profile first"}), 400

    spread = 0.5
    lat = float(base_lat) + (random.random() - 0.5) * spread
    lng = float(base_lng) + (random.random() - 0.5) * spread

    post = AudioPost(
        user_id=current_user.id,
        post_type="text",
        text_content=text,
        lat=lat,
        lng=lng,
    )
    db.session.add(post)
    db.session.commit()

    return jsonify(post.to_dict(current_user.id)), 201


@api_bp.route("/audio/<post_id>", methods=["DELETE"])
@login_required
def delete_audio(post_id):
    """Soft-delete a post from the owner's profile"""
    post = AudioPost.query.get_or_404(post_id)
    if post.user_id != current_user.id:
        return jsonify({"error": "Not allowed"}), 403
    post.is_active = False
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/my-posts")
@login_required
def my_posts():
    posts = current_user.audio_posts.order_by(AudioPost.created_at.desc()).all()
    return jsonify([p.to_dict(current_user.id) for p in posts])


@api_bp.route("/search")
def search_users():
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        users = User.query.filter(
            User.username.ilike(like) | User.full_name.ilike(like)
        ).limit(50).all()
    else:
        users = User.query.limit(50).all()
    return jsonify([{
        "id": u.id,
        "full_name": u.full_name,
        "username": u.username,
        "avatar_url": u.avatar_url,
        "bio": u.bio,
        "location_city": u.location_city,
        "location_country": u.location_country,
    } for u in users])


# ---------- Admin routes ----------

@api_bp.route("/admin/stats")
@login_required
def admin_stats():
    if not is_admin(current_user):
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({
        "total_users": User.query.count(),
        "total_posts": AudioPost.query.filter_by(is_active=True).count(),
        "total_deleted": AudioPost.query.filter_by(is_active=False).count(),
    })


@api_bp.route("/admin/users")
@login_required
def admin_users():
    if not is_admin(current_user):
        return jsonify({"error": "Forbidden"}), 403
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([{
        "id": u.id,
        "full_name": u.full_name,
        "username": u.username,
        "email": u.email,
        "avatar_url": u.avatar_url,
        "location_country": u.location_country,
        "post_count": u.audio_posts.filter_by(is_active=True).count(),
        "created_at": u.created_at.isoformat() if u.created_at else None,
    } for u in users])


@api_bp.route("/admin/posts")
@login_required
def admin_posts():
    if not is_admin(current_user):
        return jsonify({"error": "Forbidden"}), 403
    posts = AudioPost.query.filter_by(is_active=True).order_by(
        AudioPost.created_at.desc()
    ).limit(200).all()
    return jsonify([{
        "id": p.id,
        "text_content": p.text_content,
        "post_type": p.post_type,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "author_name": p.author.full_name,
        "author_id": p.author.id,
    } for p in posts])


@api_bp.route("/admin/post/<post_id>", methods=["DELETE"])
@login_required
def admin_delete_post(post_id):
    if not is_admin(current_user):
        return jsonify({"error": "Forbidden"}), 403
    post = AudioPost.query.get_or_404(post_id)
    post.is_active = False
    db.session.commit()
    return jsonify({"ok": True})


@api_bp.route("/admin/user/<user_id>", methods=["DELETE"])
@login_required
def admin_delete_user(user_id):
    if not is_admin(current_user):
        return jsonify({"error": "Forbidden"}), 403
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({"error": "Cannot delete yourself"}), 400
    AudioPost.query.filter_by(user_id=user.id).update({"is_active": False})
    db.session.delete(user)
    db.session.commit()
    return jsonify({"ok": True})