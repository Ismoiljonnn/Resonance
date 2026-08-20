import random

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from .models import db, User, AudioPost

api_bp = Blueprint("api", __name__, url_prefix="/api")

# ---------- Guest mode: no login required ----------

@api_bp.route("/markers")
def get_markers():
    """All active markers shown on the 3D globe (visible to guests too)"""
    posts = AudioPost.query.filter_by(is_active=True).all()
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
    if len(q) < 1:
        return jsonify([])
    like = f"%{q}%"
    users = User.query.filter(
        User.username.ilike(like) | User.full_name.ilike(like)
    ).limit(30).all()
    return jsonify([{
        "id": u.id,
        "full_name": u.full_name,
        "username": u.username,
        "avatar_url": u.avatar_url,
        "bio": u.bio,
        "location_city": u.location_city,
        "location_country": u.location_country,
    } for u in users])